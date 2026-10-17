import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import type { RequestActor } from "../../common/auth/auth.types";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PriceListService } from "../inventory/price-list.service";
import { OrderRequestsService, isPartnerRole } from "../order-requests/order-requests.service";
import { QuotationPhotosService, type UploadedPhoto } from "./quotation-photos.service";

export const QUOTATION_STATUSES = ["requested", "quoted", "accepted", "declined", "cancelled"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

const MAX_LINES = 200;
const MAX_PHOTOS = 6;
const MAX_QUANTITY = 100_000;
const DEFAULT_VALID_DAYS = 7;
const QUOTATION_COLUMNS =
  "id, quotation_number, customer_id, partner_id, selection_id, status, note, contact_phone, photo_keys, discount_amount, admin_note, valid_until, quoted_at, order_request_id, created_at, updated_at";
const ITEM_COLUMNS = "quotation_id, position, item_key, item_name, category, brand, quantity, unit_price, mrp";

type QuotationRow = {
  id: string;
  quotation_number: string;
  customer_id: string;
  partner_id: string | null;
  selection_id: string | null;
  status: QuotationStatus;
  note: string | null;
  contact_phone: string | null;
  photo_keys: string[];
  discount_amount: number;
  admin_note: string | null;
  valid_until: string | null;
  quoted_at: string | null;
  order_request_id: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  quotation_id: string;
  position: number;
  item_key: string;
  item_name: string;
  category: string;
  brand: string | null;
  quantity: number;
  unit_price: number;
  mrp: number;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

const isAdminRole = (role: string) => role === "admin" || role === "tenant_admin";

/** Today's date in India, for quotation validity. */
function todayInIndia() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly notificationsService: NotificationsService,
    private readonly priceList: PriceListService,
    private readonly orderRequests: OrderRequestsService,
    private readonly photos: QuotationPhotosService
  ) {}

  private get db() {
    return this.supabaseAdmin.getClient();
  }

  private async requireContext(actor: RequestActor) {
    if (!actor.appUserId) throw new UnauthorizedException("Your profile could not be found. Please sign in again.");
    const tenantId = actor.defaultTenantId;
    if (!tenantId) throw new BadRequestException("Please select a workspace.");
    await this.tenantAccess.assertTenantAccess(actor, tenantId);
    const role = (actor.role ?? "").toLowerCase();
    return { userId: actor.appUserId, tenantId, isAdmin: isAdminRole(role), isPartner: isPartnerRole(role) };
  }

  private async notify(tenantId: string, userIds: string[], title: string, body: string, data: Record<string, unknown>) {
    try {
      await this.notificationsService.createBulkNotifications({ tenantId, userIds, title, body, data: { module: "quotations", ...data } });
    } catch (error) {
      this.logger.warn(`Quotation notification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getQuotation(tenantId: string, id: string) {
    const result = await this.db.from("quotations").select(QUOTATION_COLUMNS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new NotFoundException("This quotation could not be found.");
    return result.data as QuotationRow;
  }

  private async getItems(quotationIds: string[]) {
    if (!quotationIds.length) return [] as ItemRow[];
    const result = await this.db.from("quotation_items").select(ITEM_COLUMNS).in("quotation_id", quotationIds).order("position");
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []) as ItemRow[];
  }

  /** Only moves a quotation on if nobody changed it meanwhile. */
  private async setStatus(row: QuotationRow, changes: Record<string, unknown>) {
    const updated = await this.db
      .from("quotations")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", row.status)
      .select("id")
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) throw new ConflictException("This quotation was just updated. Refresh to see the latest.");
  }

  async uploadPhoto(actor: RequestActor, file: UploadedPhoto | undefined) {
    const { userId, tenantId } = await this.requireContext(actor);
    return this.photos.upload(tenantId, userId, file);
  }

  async list(actor: RequestActor) {
    const { userId, tenantId, isAdmin } = await this.requireContext(actor);
    let query = this.db.from("quotations").select(QUOTATION_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
    if (!isAdmin) query = query.eq("customer_id", userId);
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data ?? []) as QuotationRow[];

    const [items, people] = await Promise.all([
      this.getItems(rows.map((row) => row.id)),
      isAdmin && rows.length
        ? this.db.from("users").select("id, full_name, phone, role").in("id", [...new Set(rows.map((row) => row.customer_id))])
        : Promise.resolve({ data: [], error: null })
    ]);
    if (people.error) throw new Error(people.error.message);
    const peopleById = new Map((people.data ?? []).map((person: any) => [person.id, person]));
    const today = todayInIndia();

    const quotations = await Promise.all(
      rows.map(async (row) => {
        const lines = items.filter((item) => item.quotation_id === row.id);
        // The person sees prices once the shop has priced the quotation; the shop always does.
        const showPrices = isAdmin || row.status !== "requested";
        const subtotal = money(lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0));
        const discount = money(Math.min(Number(row.discount_amount) || 0, subtotal));
        const customer = peopleById.get(row.customer_id);
        return {
          id: row.id,
          quotation_number: row.quotation_number,
          status: row.status,
          expired: row.status === "quoted" && Boolean(row.valid_until) && row.valid_until! < today,
          note: row.note,
          contact_phone: row.contact_phone,
          photo_urls: await this.photos.viewUrls(row.photo_keys ?? []),
          admin_note: row.admin_note,
          valid_until: row.valid_until,
          quoted_at: row.quoted_at,
          order_request_id: row.order_request_id,
          created_at: row.created_at,
          ...(showPrices ? { subtotal, discount_amount: discount, total: money(subtotal - discount) } : {}),
          ...(isAdmin && customer ? { customer: { id: customer.id, full_name: customer.full_name, phone: customer.phone, role: customer.role } } : {}),
          items: lines.map((line) => ({
            key: line.item_key,
            name: line.item_name,
            category: line.category,
            brand: line.brand,
            quantity: Number(line.quantity),
            ...(showPrices ? { unit_price: Number(line.unit_price), mrp: Number(line.mrp) } : {})
          }))
        };
      })
    );

    return { canManage: isAdmin, quotations };
  }

  async create(actor: RequestActor, body: Record<string, unknown>) {
    const { userId, tenantId, isPartner } = await this.requireContext(actor);

    const quantities = new Map<string, number>();
    for (const raw of Array.isArray(body.items) ? body.items : []) {
      const key = cleanText((raw as Record<string, unknown>)?.key, 40);
      const quantity = Math.floor(Number((raw as Record<string, unknown>)?.quantity));
      if (!key) continue;
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        throw new BadRequestException("Quantities must be at least 1.");
      }
      quantities.set(key, (quantities.get(key) ?? 0) + quantity);
    }

    const prefix = this.photos.ownerPrefix(tenantId, userId);
    const photoKeys = [...new Set((Array.isArray(body.photo_keys) ? body.photo_keys : []).map((key) => cleanText(key, 300)).filter(Boolean))];
    if (photoKeys.length > MAX_PHOTOS) throw new BadRequestException(`Add up to ${MAX_PHOTOS} photos.`);
    if (photoKeys.some((key) => !key.startsWith(prefix))) throw new ForbiddenException("One of the photos could not be used. Please upload it again.");

    return this.requestQuotation({
      tenantId,
      customerId: userId,
      partnerId: isPartner ? userId : null,
      selectionId: null,
      quantities,
      photoKeys,
      note: cleanText(body.note, 2000) || null,
      contactPhone: cleanText(body.contact_phone, 20) || null
    });
  }

  /** Records a quotation request and tells the shop. Lines are prefilled with today's prices. */
  async requestQuotation(args: {
    tenantId: string;
    customerId: string;
    partnerId: string | null;
    selectionId: string | null;
    quantities: Map<string, number>;
    photoKeys: string[];
    note: string | null;
    contactPhone: string | null;
  }) {
    const { tenantId, customerId: userId, quantities, photoKeys, note, contactPhone } = args;
    if (quantities.size > MAX_LINES) throw new BadRequestException(`A quotation can have up to ${MAX_LINES} different items.`);
    if (!quantities.size && !photoKeys.length && !note) {
      throw new BadRequestException("Add items, a photo of your list, or a note describing what you need.");
    }
    if (contactPhone && !/^\+?[0-9 -]{7,20}$/.test(contactPhone)) throw new BadRequestException("Enter a valid contact number.");

    const found = await this.priceList.findItems(tenantId, [...quantities.keys()]);
    if ([...found.values()].some((item) => !item)) {
      throw new ConflictException("Some items are no longer in the price list. Remove them and try again.");
    }

    const inserted = await this.db
      .from("quotations")
      .insert({
        tenant_id: tenantId,
        customer_id: userId,
        partner_id: args.partnerId,
        selection_id: args.selectionId,
        note,
        contact_phone: contactPhone,
        photo_keys: photoKeys
      })
      .select("id, quotation_number, status")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const quotation = inserted.data as { id: string; quotation_number: string; status: QuotationStatus };

    if (quantities.size) {
      // Prefilled with today's prices for the shop; the person sees them only once quoted.
      const lines = [...found].map(([key, item], position) => ({
        quotation_id: quotation.id,
        position,
        item_key: key,
        item_name: item!.displayName,
        category: item!.displayCategory,
        brand: item!.brand,
        quantity: quantities.get(key)!,
        unit_price: item!.final_price,
        mrp: item!.mrp
      }));
      const itemInsert = await this.db.from("quotation_items").insert(lines);
      if (itemInsert.error) {
        await this.db.from("quotations").delete().eq("id", quotation.id);
        throw new Error(itemInsert.error.message);
      }
    }

    const [admins, profile] = await Promise.all([
      this.orderRequests.listAdminIds(tenantId),
      this.db.from("users").select("full_name").eq("id", userId).maybeSingle()
    ]);
    const who = (profile.data?.full_name as string | undefined) || "A customer";
    const what = [quantities.size ? `${quantities.size} item${quantities.size === 1 ? "" : "s"}` : "", photoKeys.length ? `${photoKeys.length} photo${photoKeys.length === 1 ? "" : "s"}` : ""]
      .filter(Boolean)
      .join(" and ");
    await this.notify(tenantId, admins.filter((id) => id !== userId), `Quotation request ${quotation.quotation_number}`, `${who} asked for a quotation${what ? ` (${what})` : ""}.`, {
      quotationId: quotation.id
    });

    return quotation;
  }

  /** The shop prices (or re-prices) a quotation and sends it. */
  async quote(actor: RequestActor, id: string, body: Record<string, unknown>) {
    const { tenantId, isAdmin } = await this.requireContext(actor);
    if (!isAdmin) throw new ForbiddenException("Only the shop can prepare quotations.");
    const row = await this.getQuotation(tenantId, id);
    if (row.status !== "requested" && row.status !== "quoted") {
      throw new ConflictException("This quotation can no longer be changed.");
    }

    const rawLines = Array.isArray(body.items) ? body.items : [];
    if (!rawLines.length) throw new BadRequestException("Add at least one item to the quotation.");
    if (rawLines.length > MAX_LINES) throw new BadRequestException(`A quotation can have up to ${MAX_LINES} items.`);
    const keys = rawLines.map((raw) => cleanText((raw as Record<string, unknown>)?.key, 40)).filter(Boolean);
    const found = await this.priceList.findItems(tenantId, keys);

    const lines = rawLines.map((raw, position) => {
      const line = raw as Record<string, unknown>;
      const key = cleanText(line.key, 40);
      const item = key ? found.get(key) : undefined;
      const name = cleanText(line.name, 300) || item?.displayName || "";
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unit_price);
      if (!name) throw new BadRequestException(`Line ${position + 1} needs an item name.`);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) throw new BadRequestException(`Check the quantity of ${name}.`);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new BadRequestException(`Check the price of ${name}.`);
      return {
        quotation_id: row.id,
        position,
        item_key: item ? key : "",
        item_name: name,
        category: cleanText(line.category, 100) || item?.displayCategory || "",
        brand: cleanText(line.brand, 100) || item?.brand || null,
        quantity,
        unit_price: money(unitPrice),
        mrp: item?.mrp ?? 0
      };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
    const discount = money(Number(body.discount_amount) || 0);
    if (discount < 0 || discount > subtotal) throw new BadRequestException("The discount must be between 0 and the quotation subtotal.");
    const validDays = Math.min(90, Math.max(1, Math.floor(Number(body.valid_days) || DEFAULT_VALID_DAYS)));
    const validUntil = new Date(Date.now() + 5.5 * 3600 * 1000 + validDays * 86_400_000).toISOString().slice(0, 10);

    const removed = await this.db.from("quotation_items").delete().eq("quotation_id", row.id);
    if (removed.error) throw new Error(removed.error.message);
    const insertedLines = await this.db.from("quotation_items").insert(lines);
    if (insertedLines.error) throw new Error(insertedLines.error.message);

    const adminNote = cleanText(body.admin_note, 1000) || null;
    await this.setStatus(row, { status: "quoted", discount_amount: discount, admin_note: adminNote, valid_until: validUntil, quoted_at: new Date().toISOString() });

    await this.notify(
      tenantId,
      [row.customer_id],
      `Your quotation ${row.quotation_number} is ready`,
      `Total ₹${Math.round(subtotal - discount).toLocaleString("en-IN")}, valid until ${validUntil}. Open Quotations to accept it.`,
      { quotationId: row.id, status: "quoted" }
    );
    return { id: row.id, status: "quoted" as const, total: money(subtotal - discount), valid_until: validUntil };
  }

  async accept(actor: RequestActor, id: string, body: Record<string, unknown>) {
    const { userId, tenantId } = await this.requireContext(actor);
    const row = await this.getQuotation(tenantId, id);
    if (row.customer_id !== userId) throw new NotFoundException("This quotation could not be found.");
    if (row.status !== "quoted") throw new ConflictException("Only a priced quotation can be accepted.");
    if (row.valid_until && row.valid_until < todayInIndia()) {
      throw new ConflictException("This quotation has expired. Ask the shop for a fresh one.");
    }
    const deliveryAddress = cleanText(body.delivery_address, 500);
    if (deliveryAddress.length < 5) throw new BadRequestException("Add the delivery address.");

    const lines = await this.getItems([row.id]);
    if (!lines.length) throw new ConflictException("This quotation has no items.");

    // Mark it first so a double tap cannot create two orders.
    await this.setStatus(row, { status: "accepted" });
    let order: { id: string; order_number: string };
    try {
      order = await this.orderRequests.createFromQuotation({
        tenantId,
        customerId: userId,
        partnerId: row.partner_id,
        selectionId: row.selection_id,
        quotationNumber: row.quotation_number,
        deliveryAddress,
        contactPhone: cleanText(body.contact_phone, 20) || row.contact_phone,
        note: cleanText(body.note, 1000) || null,
        lines: lines.map((line) => ({
          item_key: line.item_key,
          item_name: line.item_name,
          category: line.category,
          brand: line.brand,
          quantity: Number(line.quantity),
          unit_price: Number(line.unit_price),
          mrp: Number(line.mrp)
        }))
      });
    } catch (error) {
      await this.db.from("quotations").update({ status: "quoted" }).eq("id", row.id);
      throw error;
    }
    await this.db.from("quotations").update({ order_request_id: order.id }).eq("id", row.id);
    return { id: row.id, status: "accepted" as const, order_number: order.order_number };
  }

  /** The person declines a priced quotation or withdraws a request; the shop can close a request. */
  async close(actor: RequestActor, id: string, body: Record<string, unknown>) {
    const { userId, tenantId, isAdmin } = await this.requireContext(actor);
    const row = await this.getQuotation(tenantId, id);
    const owner = row.customer_id === userId;
    if (!owner && !isAdmin) throw new NotFoundException("This quotation could not be found.");

    const status: QuotationStatus = row.status === "quoted" && owner ? "declined" : "cancelled";
    if (row.status !== "requested" && !(row.status === "quoted")) {
      throw new ConflictException("This quotation is already closed.");
    }
    await this.setStatus(row, { status, ...(isAdmin && !owner ? { admin_note: cleanText(body.admin_note, 1000) || row.admin_note } : {}) });

    if (owner) {
      const admins = await this.orderRequests.listAdminIds(tenantId);
      await this.notify(tenantId, admins.filter((id) => id !== userId), `Quotation ${row.quotation_number} ${status}`, status === "declined" ? "The customer declined the quotation." : "The customer withdrew the request.", { quotationId: row.id, status });
    } else {
      await this.notify(tenantId, [row.customer_id], `Quotation ${row.quotation_number} closed`, cleanText(body.admin_note, 1000) || "The shop closed this quotation request.", { quotationId: row.id, status });
    }
    return { id: row.id, status };
  }
}
