import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { sign } from "jsonwebtoken";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { indexPriceList, type IndexedPriceListItem } from "../../core/gateway/price-list-taxonomy";
import { parsePriceListDocument } from "./price-list.parser";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DOWNLOAD_FAILED = "The price list could not be downloaded right now. Please try again shortly.";
const PAGE_SIZE = 1000;
const DEFAULT_TENANT_SLUG = "mahalaxmi-electricals";

export type PriceListView = "full" | "prices" | "catalog";

type RawRow = { category: string; group_name: string; item_name: string; final_price: number; mrp: number; cost_price: number; stock_label: string };
export type SnapshotItem = IndexedPriceListItem<RawRow> & { key: string };
type SyncState = { content_hash: string; item_count: number; synced_at: string; checked_at: string };
type Snapshot = {
  version: string;
  syncedAt: string | null;
  items: SnapshotItem[];
  byKey: Map<string, SnapshotItem>;
  views: Partial<Record<PriceListView, unknown[]>>;
};

/**
 * A short id for a price list item that survives re-syncs (rows are replaced each time,
 * so their database ids do not). Tally item names are unique within a company.
 */
export function driveDownloadUrl(link: string) {
  const value = link.trim();
  const id =
    /^[\w-]{20,}$/.test(value)
      ? value
      : value.match(/drive\.google\.com\/file\/d\/([\w-]+)/)?.[1] ??
        (/(drive|docs)\.google\.com|drive\.usercontent\.google\.com/.test(value) ? value.match(/[?&]id=([\w-]+)/)?.[1] : undefined);
  return id ? `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` : value;
}

export function priceListItemKey(itemName: string) {
  return createHash("sha1").update(itemName.trim().toLowerCase()).digest("base64url").slice(0, 12);
}

/** A download problem whose message is safe and useful to show the admin. */
class PriceListSourceError extends Error {}

@Injectable()
export class PriceListService {
  private readonly logger = new Logger(PriceListService.name);
  private driveToken: { value: string; expiresAt: number } | null = null;
  private readonly cache = new Map<string, Snapshot>();

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private get db() {
    return this.supabaseAdmin.getClient();
  }

  private get driveFileId() {
    return (process.env.PRICE_LIST_DRIVE_FILE_ID || "").trim();
  }

  private get serviceAccountJson() {
    return (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  }

  private get publicUrl() {
    return (process.env.GOOGLE_DRIVE_PRODUCTS_URL || "").trim();
  }

  /**
   * Turns any Google Drive share link ("/file/d/<id>/view", "open?id=<id>", "uc?id=<id>")
   * into the direct download address; the share links open a web page, not the file.
   * Other links are used as they are.
   */
  private publicDownloadUrl() {
    return driveDownloadUrl(this.publicUrl);
  }

  isConfigured() {
    return Boolean(this.driveFileId || this.publicUrl);
  }

  /** Service-account JWT bearer grant: no consent screen and no refresh token to expire. */
  private async getDriveAccessToken() {
    if (this.driveToken && Date.now() < this.driveToken.expiresAt) return this.driveToken.value;

    let account: { client_email?: string; private_key?: string };
    try {
      account = JSON.parse(this.serviceAccountJson);
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
    if (!account.client_email || !account.private_key) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
    }

    const now = Math.floor(Date.now() / 1000);
    const assertion = sign(
      { iss: account.client_email, scope: DRIVE_READONLY_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 },
      account.private_key,
      { algorithm: "RS256" }
    );
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) throw new Error(`Google token request failed: ${response.status} ${await response.text()}`);

    const data = await response.json() as { access_token: string; expires_in: number };
    this.driveToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return data.access_token;
  }

  private async downloadSource() {
    let response: Response;
    if (this.driveFileId && this.serviceAccountJson) {
      const token = await this.getDriveAccessToken();
      response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(this.driveFileId)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000) }
      );
    } else {
      // A file shared as "Anyone with the link" needs no Google sign-in.
      const url = this.publicUrl ? this.publicDownloadUrl() : driveDownloadUrl(this.driveFileId);
      response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    }
    if (!response.ok) throw new Error(`Price list download failed: ${response.status} ${await response.text()}`);
    if ((response.headers.get("content-type") || "").includes("text/html")) {
      const page = await response.text().catch(() => "");
      this.logger.warn(`Drive answered with a web page: ${page.match(/<title>([^<]*)<\/title>/i)?.[1] ?? page.slice(0, 120)}`);
      // Google answers with a sign-in or verification page instead of the file when it
      // is not shared publicly, or when it refuses requests from server IP addresses.
      throw new PriceListSourceError(
        "Google Drive sent a web page instead of the price list file. Share the file as \"Anyone with the link\", or set up the service account."
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async getSyncState(tenantId: string) {
    const result = await this.db
      .from("price_list_sync_state")
      .select("content_hash, item_count, synced_at, checked_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    return (result.data as SyncState | null) ?? null;
  }

  private async saveSyncState(tenantId: string, state: Partial<SyncState> & { last_error?: string | null }) {
    const result = await this.db.from("price_list_sync_state").upsert({ tenant_id: tenantId, ...state }, { onConflict: "tenant_id" });
    if (result.error) this.logger.warn(`Price list sync state not saved: ${result.error.message}`);
  }

  /**
   * Reads the Tally export from Drive and replaces the price list when it changed. An
   * unchanged export only records the check, so customers' cached copies stay valid.
   */
  async sync(tenantId: string) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("The price list source is not set up yet. Please contact support.");
    }

    let buffer: Buffer;
    try {
      buffer = await this.downloadSource();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      const message = error instanceof PriceListSourceError ? error.message : DOWNLOAD_FAILED;
      await this.saveSyncState(tenantId, { checked_at: new Date().toISOString(), last_error: message });
      throw new BadGatewayException(message);
    }

    const items = parsePriceListDocument(buffer);
    // An empty parse means a broken or wrong file, never a real empty price list:
    // keep the last good snapshot instead of wiping it.
    if (!items.length) {
      const message = "No items were found in the latest price list file, so the current list was kept.";
      await this.saveSyncState(tenantId, { checked_at: new Date().toISOString(), last_error: message });
      throw new BadGatewayException(message);
    }

    const contentHash = createHash("sha256").update(JSON.stringify(items)).digest("hex");
    const now = new Date().toISOString();
    const previous = await this.getSyncState(tenantId);
    if (previous && previous.content_hash === contentHash) {
      await this.saveSyncState(tenantId, { checked_at: now, last_error: null });
      return { count: previous.item_count, syncedAt: previous.synced_at, changed: false };
    }

    const result = await this.db.rpc("replace_price_list", { p_tenant_id: tenantId, p_items: items });
    if (result.error) {
      throw new Error(result.error.message);
    }
    const count = Number(result.data ?? items.length);
    await this.saveSyncState(tenantId, { content_hash: contentHash, item_count: count, synced_at: now, checked_at: now, last_error: null });
    this.cache.delete(tenantId);

    return { count, syncedAt: now, changed: true };
  }

  /** The tenant the scheduled (every 15 minutes) sync keeps up to date. */
  async syncScheduledTenant() {
    const slug = (process.env.PRICE_LIST_TENANT_SLUG || DEFAULT_TENANT_SLUG).trim();
    const tenant = await this.db.from("tenants").select("id").eq("slug", slug).maybeSingle();
    if (tenant.error) throw new Error(tenant.error.message);
    if (!tenant.data) throw new ServiceUnavailableException(`No workspace with the slug "${slug}".`);
    return this.sync(tenant.data.id as string);
  }

  /** Every row of a tenant's price list, fetched in parallel 1000-row pages (PostgREST's cap). */
  private async fetchRows(tenantId: string, expectedCount: number) {
    const fetchPage = async (from: number) => {
      const page = await this.db
        .from("price_list_items")
        .select("category, group_name, item_name, final_price, mrp, cost_price, stock_label")
        .eq("tenant_id", tenantId)
        .order("item_name")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (page.error) throw new Error(page.error.message);
      return page.data as unknown as RawRow[];
    };

    const pageCount = Math.max(1, Math.ceil(expectedCount / PAGE_SIZE));
    const pages = await Promise.all(Array.from({ length: pageCount }, (_, index) => fetchPage(index * PAGE_SIZE)));
    const rows = pages.flat();
    // The count can be behind a sync that just finished: keep reading until a short page.
    for (let from = pageCount * PAGE_SIZE; pages[pages.length - 1].length === PAGE_SIZE; from += PAGE_SIZE) {
      const page = await fetchPage(from);
      pages.push(page);
      rows.push(...page);
    }
    return rows;
  }

  /**
   * The price list with derived fields, kept in memory until the next sync changes it.
   * Each request costs one small query (the sync state) when the cached copy is current.
   */
  private async snapshot(tenantId: string): Promise<Snapshot> {
    const state = await this.getSyncState(tenantId);
    const version = state?.synced_at ?? "none";
    const cached = this.cache.get(tenantId);
    if (cached && cached.version === version) return cached;

    const rows = await this.fetchRows(tenantId, state?.item_count ?? 0);
    const items = indexPriceList(rows.map((row) => ({
      ...row,
      final_price: Number(row.final_price) || 0,
      mrp: Number(row.mrp) || 0,
      cost_price: Number(row.cost_price) || 0
    }))).map((item) => ({ ...item, key: priceListItemKey(item.item_name) }));

    const snapshot: Snapshot = { version, syncedAt: state?.synced_at ?? null, items, byKey: new Map(items.map((item) => [item.key, item])), views: {} };
    this.cache.set(tenantId, snapshot);
    return snapshot;
  }

  private async categoryImages(tenantId: string) {
    const images = await this.db.from("price_list_categories").select("category, image_url, updated_at").eq("tenant_id", tenantId);
    if (images.error) throw new Error(images.error.message);
    const rows = (images.data ?? []) as Array<{ category: string; image_url: string; updated_at: string }>;
    return {
      images: Object.fromEntries(rows.map((row) => [row.category, row.image_url])) as Record<string, string>,
      version: rows.map((row) => row.updated_at).sort().pop() ?? "0"
    };
  }

  /**
   * "full" (admins, with cost price), "prices" (pricing staff) or "catalog" (everyone
   * else: names, categories and in stock or not, never a price). Returns an ETag so
   * browsers can reuse their copy when nothing changed.
   */
  async list(tenantId: string, view: PriceListView) {
    const [snapshot, images] = await Promise.all([this.snapshot(tenantId), this.categoryImages(tenantId)]);
    const etag = `W/"pl-${view}-${createHash("sha1").update(`${snapshot.version}|${images.version}`).digest("hex").slice(0, 16)}"`;

    let items = snapshot.views[view];
    if (!items) {
      items = snapshot.items.map((item) =>
        view === "catalog"
          ? { key: item.key, name: item.displayName, category: item.displayCategory, brand: item.brand, inStock: !item.outOfStock }
          : {
              key: item.key,
              category: item.category,
              group_name: item.group_name,
              item_name: item.item_name,
              final_price: item.final_price,
              mrp: item.mrp,
              ...(view === "full" ? { cost_price: item.cost_price } : {}),
              stock_label: item.stock_label
            }
      );
      snapshot.views[view] = items;
    }

    return {
      etag,
      data: {
        configured: this.isConfigured(),
        syncedAt: snapshot.syncedAt,
        pricesHidden: view === "catalog",
        items,
        categoryImages: images.images
      }
    };
  }

  /** Current price list entries for order lines, by item key. */
  async findItems(tenantId: string, keys: string[]) {
    const snapshot = await this.snapshot(tenantId);
    return new Map(keys.map((key) => [key, snapshot.byKey.get(key)] as const));
  }

  async saveCategoryImage(tenantId: string, category: unknown, imageUrl: unknown) {
    const name = typeof category === "string" ? category.trim() : "";
    const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
    if (!name) throw new BadRequestException("Choose a category for this image.");
    if (!/^https:\/\/\S+$/i.test(url)) throw new BadRequestException("The image link is not valid. Please upload the image again.");

    const result = await this.db
      .from("price_list_categories")
      .upsert({ tenant_id: tenantId, category: name, image_url: url, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,category" });
    if (result.error) {
      throw new Error(result.error.message);
    }

    return { category: name, imageUrl: url };
  }
}
