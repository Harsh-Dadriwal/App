import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { RequestActor } from "../../common/auth/auth.types";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PriceListService } from "../inventory/price-list.service";
import { toE164 } from "../identity/phone-auth.service";
import { OrderRequestsService, isPartnerRole, parseItemQuantities } from "../order-requests/order-requests.service";
import { QuotationsService } from "../quotations/quotations.service";

const MAX_LINES = 150;
const SELECTION_COLUMNS = "id, selection_number, created_by, title, customer_name, customer_phone, customer_id, site_note, status, created_at, updated_at";
const ITEM_COLUMNS = "selection_id, position, item_key, item_name, category, brand, quantity, note";

type SelectionRow = {
  id: string;
  selection_number: string;
  created_by: string;
  title: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_id: string | null;
  site_note: string | null;
  status: "active" | "ordered" | "closed";
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  selection_id: string;
  position: number;
  item_key: string;
  item_name: string;
  category: string;
  brand: string | null;
  quantity: number;
  note: string | null;
};

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

const isAdminRole = (role: string) => role === "admin" || role === "tenant_admin";

/**
 * Product selections: an electrician or architect picks products for a customer's job.
 * The customer (linked by phone) sees it in their app and orders it or asks for a quotation
 * in one tap; the professional earns incentives when that order is delivered. Admins see
 * every selection with a price estimate.
 */
@Injectable()
export class SelectionsService {
  private readonly logger = new Logger(SelectionsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly notificationsService: NotificationsService,
    private readonly priceList: PriceListService,
    private readonly orderRequests: OrderRequestsService,
    private readonly quotations: QuotationsService
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
      await this.notificationsService.createBulkNotifications({ tenantId, userIds, title, body, data: { module: "selections", ...data } });
    } catch (error) {
      this.logger.warn(`Selection notification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getSelection(tenantId: string, id: string) {
    const result = await this.db.from("product_selections").select(SELECTION_COLUMNS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new NotFoundException("This selection could not be found.");
    return result.data as SelectionRow;
  }

  private async getItems(ids: string[]) {
    if (!ids.length) return [] as ItemRow[];
    const result = await this.db.from("product_selection_items").select(ITEM_COLUMNS).in("selection_id", ids).order("position");
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []) as ItemRow[];
  }

  /** The customer account with this phone number in the workspace, if they have one. */
  private async findCustomerByPhone(tenantId: string, phone: string | null) {
    if (!phone) return null;
    const digits = phone.replace(/^\+/, "");
    const users = await this.db.from("users").select("id, role").in("phone", [phone, digits, digits.slice(-10)]).limit(5);
    if (users.error) throw new Error(users.error.message);
    const candidates = (users.data ?? []).filter((user: any) => user.role === "customer").map((user: any) => user.id as string);
    if (!candidates.length) return null;
    const member = await this.db.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId).in("user_id", candidates).limit(1);
    if (member.error) throw new Error(member.error.message);
    return (member.data?.[0]?.user_id as string | undefined) ?? null;
  }

  /** Reads and checks the selection fields and items from a request body. */
  private async readSelection(tenantId: string, body: Record<string, unknown>) {
    const title = cleanText(body.title, 150);
    if (title.length < 3) throw new BadRequestException("Give the selection a name, e.g. \"Sharma house – switches\".");
    const rawPhone = cleanText(body.customer_phone, 20);
    const customerPhone = rawPhone ? toE164(rawPhone) : null;
    if (rawPhone && !customerPhone) throw new BadRequestException("Enter the customer's 10-digit mobile number.");

    const quantities = parseItemQuantities(body.items, 100_000);
    if (!quantities.size) throw new BadRequestException("Add at least one product.");
    if (quantities.size > MAX_LINES) throw new BadRequestException(`A selection can have up to ${MAX_LINES} products.`);
    const notes = new Map<string, string>();
    for (const raw of Array.isArray(body.items) ? body.items : []) {
      const line = raw as Record<string, unknown>;
      const note = cleanText(line?.note, 200);
      if (note) notes.set(cleanText(line.key, 40), note);
    }

    const found = await this.priceList.findItems(tenantId, [...quantities.keys()]);
    if ([...found.values()].some((item) => !item)) {
      throw new ConflictException("Some products are no longer in the price list. Remove them and try again.");
    }

    return {
      fields: {
        title,
        customer_name: cleanText(body.customer_name, 120) || null,
        customer_phone: customerPhone,
        customer_id: await this.findCustomerByPhone(tenantId, customerPhone),
        site_note: cleanText(body.site_note, 1000) || null
      },
      lines: [...found].map(([key, item], position) => ({
        position,
        item_key: key,
        item_name: item!.displayName,
        category: item!.displayCategory,
        brand: item!.brand,
        quantity: quantities.get(key)!,
        note: notes.get(key) ?? null
      }))
    };
  }

  private async tellCustomer(tenantId: string, selection: SelectionRow, creatorId: string, itemCount: number) {
    if (!selection.customer_id) return;
    const creator = await this.db.from("users").select("full_name, role").eq("id", creatorId).maybeSingle();
    const who = creator.data ? `${creator.data.full_name} (${creator.data.role})` : "Your electrician";
    await this.notify(
      tenantId,
      [selection.customer_id],
      `${who} selected products for you`,
      `${selection.title}: ${itemCount} product${itemCount === 1 ? "" : "s"}. Open Selections to order them or get a quotation.`,
      { selectionId: selection.id }
    );
  }

  async create(actor: RequestActor, body: Record<string, unknown>) {
    const { userId, tenantId, isPartner } = await this.requireContext(actor);
    if (!isPartner) throw new ForbiddenException("Product selections are made by electricians and architects.");
    const { fields, lines } = await this.readSelection(tenantId, body);

    const inserted = await this.db
      .from("product_selections")
      .insert({ tenant_id: tenantId, created_by: userId, ...fields })
      .select(SELECTION_COLUMNS)
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const selection = inserted.data as SelectionRow;

    const itemInsert = await this.db.from("product_selection_items").insert(lines.map((line) => ({ ...line, selection_id: selection.id })));
    if (itemInsert.error) {
      await this.db.from("product_selections").delete().eq("id", selection.id);
      throw new Error(itemInsert.error.message);
    }

    await this.tellCustomer(tenantId, selection, userId, lines.length);
    return { id: selection.id, selection_number: selection.selection_number, linked_customer: Boolean(selection.customer_id) };
  }

  async update(actor: RequestActor, id: string, body: Record<string, unknown>) {
    const { userId, tenantId } = await this.requireContext(actor);
    const current = await this.getSelection(tenantId, id);
    if (current.created_by !== userId) throw new NotFoundException("This selection could not be found.");
    if (current.status !== "active") throw new ConflictException("This selection was already ordered or closed. Make a new one instead.");
    const { fields, lines } = await this.readSelection(tenantId, body);

    const updated = await this.db.from("product_selections").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select(SELECTION_COLUMNS).single();
    if (updated.error) throw new Error(updated.error.message);
    const removed = await this.db.from("product_selection_items").delete().eq("selection_id", id);
    if (removed.error) throw new Error(removed.error.message);
    const itemInsert = await this.db.from("product_selection_items").insert(lines.map((line) => ({ ...line, selection_id: id })));
    if (itemInsert.error) throw new Error(itemInsert.error.message);

    const selection = updated.data as SelectionRow;
    if (selection.customer_id && selection.customer_id !== current.customer_id) {
      await this.tellCustomer(tenantId, selection, userId, lines.length);
    }
    return { id, linked_customer: Boolean(selection.customer_id) };
  }

  async list(actor: RequestActor) {
    const { userId, tenantId, isAdmin, isPartner } = await this.requireContext(actor);
    let query = this.db.from("product_selections").select(SELECTION_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
    if (!isAdmin) query = isPartner ? query.eq("created_by", userId) : query.eq("customer_id", userId).neq("status", "closed");
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    const rows = (result.data ?? []) as SelectionRow[];
    const ids = rows.map((row) => row.id);

    const [items, people, orders, quotes] = await Promise.all([
      this.getItems(ids),
      rows.length
        ? this.db.from("users").select("id, full_name, phone, role").in("id", [...new Set(rows.flatMap((row) => [row.created_by, row.customer_id]).filter((value): value is string => Boolean(value)))])
        : Promise.resolve({ data: [], error: null }),
      ids.length ? this.db.from("order_requests").select("selection_id, order_number, status").in("selection_id", ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? this.db.from("quotations").select("selection_id, quotation_number, status").in("selection_id", ids) : Promise.resolve({ data: [], error: null })
    ]);
    for (const response of [people, orders, quotes]) if (response.error) throw new Error(response.error.message);
    const byId = new Map((people.data ?? []).map((person: any) => [person.id, person]));
    // Admins see what the selection is worth at today's prices.
    const prices = isAdmin ? await this.priceList.findItems(tenantId, [...new Set(items.map((item) => item.item_key))]) : new Map();

    return {
      role: isAdmin ? "admin" : isPartner ? "partner" : "customer",
      selections: rows.map((row) => {
        const lines = items.filter((item) => item.selection_id === row.id);
        const creator = byId.get(row.created_by);
        const customer = row.customer_id ? byId.get(row.customer_id) : undefined;
        return {
          id: row.id,
          selection_number: row.selection_number,
          title: row.title,
          status: row.status,
          site_note: row.site_note,
          customer_name: row.customer_name ?? customer?.full_name ?? null,
          customer_phone: isAdmin || isPartner ? row.customer_phone : null,
          customer_linked: Boolean(row.customer_id),
          created_by: creator ? { id: creator.id, full_name: creator.full_name, role: creator.role, phone: creator.phone } : null,
          created_at: row.created_at,
          updated_at: row.updated_at,
          orders: (orders.data ?? []).filter((order: any) => order.selection_id === row.id).map((order: any) => ({ number: order.order_number, status: order.status })),
          quotations: (quotes.data ?? []).filter((quote: any) => quote.selection_id === row.id).map((quote: any) => ({ number: quote.quotation_number, status: quote.status })),
          ...(isAdmin
            ? { estimated_total: lines.reduce((sum, line) => sum + Number(line.quantity) * (prices.get(line.item_key)?.final_price ?? 0), 0) }
            : {}),
          items: lines.map((line) => ({
            key: line.item_key,
            name: line.item_name,
            category: line.category,
            brand: line.brand,
            quantity: Number(line.quantity),
            note: line.note,
            ...(isAdmin ? { unit_price: prices.get(line.item_key)?.final_price ?? null, in_stock: prices.get(line.item_key) ? !prices.get(line.item_key)!.outOfStock : false } : {})
          }))
        };
      })
    };
  }

  /** Who may act on a selection: the professional who made it, or the customer it is for. */
  private async forActor(actor: RequestActor, id: string) {
    const context = await this.requireContext(actor);
    const selection = await this.getSelection(context.tenantId, id);
    const isCreator = selection.created_by === context.userId;
    const isCustomer = selection.customer_id === context.userId;
    if (!isCreator && !isCustomer) throw new NotFoundException("This selection could not be found.");
    if (selection.status === "closed") throw new ConflictException("This selection was closed.");
    const lines = await this.getItems([selection.id]);
    if (!lines.length) throw new ConflictException("This selection has no products.");
    const quantities = new Map(lines.map((line) => [line.item_key, Number(line.quantity)]));
    return { ...context, selection, isCreator, quantities, itemCount: lines.length };
  }

  private async markOrdered(selection: SelectionRow) {
    if (selection.status === "active") {
      await this.db.from("product_selections").update({ status: "ordered", updated_at: new Date().toISOString() }).eq("id", selection.id);
    }
  }

  async order(actor: RequestActor, id: string, body: Record<string, unknown>) {
    const { userId, tenantId, selection, isCreator, quantities } = await this.forActor(actor, id);
    const order = await this.orderRequests.placeOrder({
      tenantId,
      customerId: userId,
      // The professional who made the selection earns the incentive either way.
      partnerId: selection.created_by,
      selectionId: selection.id,
      quantities,
      deliveryAddress: cleanText(body.delivery_address, 500),
      contactPhone: cleanText(body.contact_phone, 20) || null,
      note: [`From selection ${selection.selection_number} (${selection.title})`, cleanText(body.note, 800)].filter(Boolean).join(". ")
    });
    await this.markOrdered(selection);
    if (!isCreator) {
      await this.notify(tenantId, [selection.created_by], `Your selection ${selection.selection_number} was ordered`, `Order ${order.order_number}. You earn incentives when it is delivered.`, {
        selectionId: selection.id
      });
    }
    return order;
  }

  async requestQuotation(actor: RequestActor, id: string, body: Record<string, unknown>) {
    const { userId, tenantId, selection, isCreator, quantities } = await this.forActor(actor, id);
    const quotation = await this.quotations.requestQuotation({
      tenantId,
      customerId: userId,
      partnerId: selection.created_by,
      selectionId: selection.id,
      quantities,
      photoKeys: [],
      note: [`From selection ${selection.selection_number} (${selection.title})`, cleanText(body.note, 800)].filter(Boolean).join(". "),
      contactPhone: cleanText(body.contact_phone, 20) || null
    });
    if (!isCreator) {
      await this.notify(tenantId, [selection.created_by], `Quotation asked for ${selection.selection_number}`, `${quotation.quotation_number}: the customer asked the shop for prices on your selection.`, {
        selectionId: selection.id
      });
    }
    return quotation;
  }

  async close(actor: RequestActor, id: string) {
    const { userId, tenantId, isAdmin } = await this.requireContext(actor);
    const selection = await this.getSelection(tenantId, id);
    if (selection.created_by !== userId && !isAdmin) throw new NotFoundException("This selection could not be found.");
    const updated = await this.db.from("product_selections").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", id);
    if (updated.error) throw new Error(updated.error.message);
    return { id, status: "closed" as const };
  }
}
