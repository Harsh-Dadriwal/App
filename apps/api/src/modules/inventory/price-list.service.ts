import { BadGatewayException, BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { sign } from "jsonwebtoken";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { parsePriceListDocument } from "./price-list.parser";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const DOWNLOAD_FAILED = "The price list could not be downloaded right now. Please try again shortly.";
const PAGE_SIZE = 1000;

@Injectable()
export class PriceListService {
  private readonly logger = new Logger(PriceListService.name);
  private driveToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private get driveFileId() {
    return (process.env.PRICE_LIST_DRIVE_FILE_ID || "").trim();
  }

  private get serviceAccountJson() {
    return (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "").trim();
  }

  private get publicUrl() {
    return (process.env.GOOGLE_DRIVE_PRODUCTS_URL || "").trim();
  }

  isConfigured() {
    return Boolean((this.driveFileId && this.serviceAccountJson) || this.publicUrl);
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
      response = await fetch(this.publicUrl, { signal: AbortSignal.timeout(25_000) });
    }
    if (!response.ok) throw new Error(`Price list download failed: ${response.status} ${await response.text()}`);
    return Buffer.from(await response.arrayBuffer());
  }

  async sync(tenantId: string) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException("The price list source is not set up yet. Please contact support.");
    }

    let buffer: Buffer;
    try {
      buffer = await this.downloadSource();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      throw new BadGatewayException(DOWNLOAD_FAILED);
    }

    const items = parsePriceListDocument(buffer);
    // An empty parse means a broken or wrong file, never a real empty price list:
    // keep the last good snapshot instead of wiping it.
    if (!items.length) {
      throw new BadGatewayException("No items were found in the latest price list file, so the current list was kept.");
    }

    const result = await this.supabaseAdmin.getClient().rpc("replace_price_list", { p_tenant_id: tenantId, p_items: items });
    if (result.error) {
      throw new Error(result.error.message);
    }

    return { count: Number(result.data ?? items.length), syncedAt: new Date().toISOString() };
  }

  async list(tenantId: string, includeCost: boolean) {
    const columns = `category, group_name, item_name, final_price, mrp, ${includeCost ? "cost_price, " : ""}stock_label, synced_at`;
    const supabase = this.supabaseAdmin.getClient();
    const rows: Array<Record<string, unknown>> = [];

    // PostgREST caps a single response at 1000 rows; a price list runs to several thousand.
    for (let from = 0; ; from += PAGE_SIZE) {
      const page = await supabase
        .from("price_list_items")
        .select(columns)
        .eq("tenant_id", tenantId)
        .order("category")
        .order("group_name")
        .order("item_name")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (page.error) {
        throw new Error(page.error.message);
      }
      rows.push(...(page.data as unknown as Array<Record<string, unknown>>));
      if (page.data.length < PAGE_SIZE) break;
    }

    const images = await supabase.from("price_list_categories").select("category, image_url").eq("tenant_id", tenantId);
    if (images.error) {
      throw new Error(images.error.message);
    }

    return {
      configured: this.isConfigured(),
      syncedAt: (rows[0]?.synced_at as string | undefined) ?? null,
      items: rows.map(({ synced_at: _syncedAt, ...item }) => item),
      categoryImages: Object.fromEntries((images.data ?? []).map((row) => [row.category, row.image_url]))
    };
  }

  async saveCategoryImage(tenantId: string, category: unknown, imageUrl: unknown) {
    const name = typeof category === "string" ? category.trim() : "";
    const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
    if (!name) throw new BadRequestException("Choose a category for this image.");
    if (!/^https:\/\/\S+$/i.test(url)) throw new BadRequestException("The image link is not valid. Please upload the image again.");

    const result = await this.supabaseAdmin
      .getClient()
      .from("price_list_categories")
      .upsert({ tenant_id: tenantId, category: name, image_url: url, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,category" });
    if (result.error) {
      throw new Error(result.error.message);
    }

    return { category: name, imageUrl: url };
  }
}
