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

export const ORDER_REQUEST_STATUSES = ["submitted", "confirmed", "ready", "delivered", "cancelled"] as const;
export type OrderRequestStatus = (typeof ORDER_REQUEST_STATUSES)[number];

const MAX_LINES = 100;
const MAX_QUANTITY = 10_000;
const ORDER_COLUMNS = "id, order_number, customer_id, status, delivery_address, contact_phone, note, admin_note, created_at, updated_at";
const ITEM_COLUMNS = "order_request_id, item_key, item_name, category, brand, quantity, unit_price, mrp";
const STATUS_MESSAGES: Record<OrderRequestStatus, string> = {
  submitted: "has been received",
  confirmed: "is confirmed",
  ready: "is packed and ready",
  delivered: "has been delivered",
  cancelled: "was cancelled"
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_id: string;
  status: OrderRequestStatus;
  delivery_address: string;
  contact_phone: string | null;
  note: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  order_request_id: string;
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

const isAdminRole = (role: string) => role === "admin" || role === "tenant_admin";

/** Which status changes the shop and the person who ordered may make, and from which statuses. */
export function allowedOrderStatusChange(party: "customer" | "admin", from: OrderRequestStatus, to: OrderRequestStatus) {
  const rules: Record<typeof party, Partial<Record<OrderRequestStatus, OrderRequestStatus[]>>> = {
    customer: { cancelled: ["submitted"] },
    admin: {
      confirmed: ["submitted"],
      ready: ["submitted", "confirmed"],
      delivered: ["confirmed", "ready"],
      cancelled: ["submitted", "confirmed", "ready"]
    }
  };
  return rules[party][to]?.includes(from) ?? false;
}

@Injectable()
export class OrderRequestsService {
  private readonly logger = new Logger(OrderRequestsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly notificationsService: NotificationsService,
    private readonly priceList: PriceListService
  ) {}

  private get db() {
    return this.supabaseAdmin.getClient();
  }

  private async requireContext(actor: RequestActor) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("Your profile could not be found. Please sign in again.");
    }
    const tenantId = actor.defaultTenantId;
    if (!tenantId) {
      throw new BadRequestException("Please select a workspace.");
    }
    await this.tenantAccess.assertTenantAccess(actor, tenantId);
    return { userId: actor.appUserId, tenantId, role: (actor.role ?? "").toLowerCase() };
  }

  /** Never lets a failed notification undo the order change that triggered it. */
  private async notify(tenantId: string, userIds: string[], title: string, body: string, data: Record<string, unknown>) {
    try {
      await this.notificationsService.createBulkNotifications({ tenantId, userIds, title, body, data: { module: "order_requests", ...data } });
    } catch (error) {
      this.logger.warn(`Order notification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Active admins of a workspace, who get notified about new orders and quotations. */
  async listAdminIds(tenantId: string) {
    const memberships = await this.db.from("tenant_memberships").select("user_id, role").eq("tenant_id", tenantId).eq("is_active", true);
    if (memberships.error) throw new Error(memberships.error.message);
    const memberIds = (memberships.data ?? []).map((row) => row.user_id as string);
    if (!memberIds.length) return [];
    const adminMemberships = new Set((memberships.data ?? []).filter((row) => isAdminRole(String(row.role))).map((row) => row.user_id as string));
    const users = await this.db.from("users").select("id, role").in("id", memberIds).eq("status", "active");
    if (users.error) throw new Error(users.error.message);
    return (users.data ?? []).filter((user) => user.role === "admin" || adminMemberships.has(user.id)).map((user) => user.id as string);
  }

  async list(actor: RequestActor) {
    const { userId, tenantId, role } = await this.requireContext(actor);
    const isAdmin = isAdminRole(role);

    let query = this.db.from("order_requests").select(ORDER_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
    if (!isAdmin) query = query.eq("customer_id", userId);
    const orders = await query;
    if (orders.error) throw new Error(orders.error.message);
    const rows = (orders.data ?? []) as OrderRow[];

    let items: ItemRow[] = [];
    let customers = new Map<string, { full_name: string; phone: string | null; role: string | null }>();
    if (rows.length) {
      const [itemResult, userResult] = await Promise.all([
        this.db.from("order_request_items").select(ITEM_COLUMNS).in("order_request_id", rows.map((row) => row.id)),
        isAdmin
          ? this.db.from("users").select("id, full_name, phone, role").in("id", [...new Set(rows.map((row) => row.customer_id))])
          : Promise.resolve({ data: [], error: null })
      ]);
      if (itemResult.error) throw new Error(itemResult.error.message);
      if (userResult.error) throw new Error(userResult.error.message);
      items = (itemResult.data ?? []) as ItemRow[];
      customers = new Map((userResult.data ?? []).map((user: any) => [user.id, user]));
    }

    const itemsByOrder = new Map<string, ItemRow[]>();
    for (const item of items) {
      const list = itemsByOrder.get(item.order_request_id) ?? [];
      list.push(item);
      itemsByOrder.set(item.order_request_id, list);
    }

    return {
      canManage: isAdmin,
      orders: rows.map((row) => {
        const lines = (itemsByOrder.get(row.id) ?? []).sort((a, b) => a.item_name.localeCompare(b.item_name));
        const customer = customers.get(row.customer_id);
        return {
          id: row.id,
          order_number: row.order_number,
          status: row.status,
          delivery_address: row.delivery_address,
          contact_phone: row.contact_phone,
          note: row.note,
          admin_note: row.admin_note,
          created_at: row.created_at,
          updated_at: row.updated_at,
          item_count: lines.length,
          total_quantity: lines.reduce((sum, line) => sum + Number(line.quantity), 0),
          // Prices are settled at billing; only the shop sees the price list estimate.
          ...(isAdmin
            ? {
                customer: customer ? { id: row.customer_id, full_name: customer.full_name, phone: customer.phone, role: customer.role } : null,
                estimated_total: lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0)
              }
            : {}),
          items: lines.map((line) => ({
            key: line.item_key,
            name: line.item_name,
            category: line.category,
            brand: line.brand,
            quantity: Number(line.quantity),
            ...(isAdmin ? { unit_price: Number(line.unit_price), mrp: Number(line.mrp) } : {})
          }))
        };
      })
    };
  }

  async create(actor: RequestActor, body: Record<string, unknown>) {
    const { userId, tenantId } = await this.requireContext(actor);

    const rawLines = Array.isArray(body.items) ? body.items : [];
    const quantities = new Map<string, number>();
    for (const raw of rawLines) {
      const key = cleanText((raw as Record<string, unknown>)?.key, 40);
      const quantity = Math.floor(Number((raw as Record<string, unknown>)?.quantity));
      if (!key) continue;
      if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
        throw new BadRequestException(`Quantities must be between 1 and ${MAX_QUANTITY.toLocaleString("en-IN")}.`);
      }
      quantities.set(key, (quantities.get(key) ?? 0) + quantity);
    }
    if (!quantities.size) throw new BadRequestException("Add at least one item to your cart.");
    if (quantities.size > MAX_LINES) throw new BadRequestException(`An order can have up to ${MAX_LINES} different items.`);

    const deliveryAddress = cleanText(body.delivery_address, 500);
    const contactPhone = cleanText(body.contact_phone, 20) || null;
    const note = cleanText(body.note, 1000) || null;
    if (deliveryAddress.length < 5) throw new BadRequestException("Add the delivery address.");
    if (contactPhone && !/^\+?[0-9 -]{7,20}$/.test(contactPhone)) throw new BadRequestException("Enter a valid contact number.");

    const found = await this.priceList.findItems(tenantId, [...quantities.keys()]);
    const missing = [...found].filter(([, item]) => !item).length;
    if (missing) {
      throw new ConflictException(
        `${missing === 1 ? "One item in your cart is" : `${missing} items in your cart are`} no longer in the price list. Remove ${missing === 1 ? "it" : "them"} and try again.`
      );
    }
    const unavailable = [...found.values()].filter((item) => item!.outOfStock).map((item) => item!.displayName);
    if (unavailable.length) {
      throw new ConflictException(`Out of stock now: ${unavailable.slice(0, 3).join(", ")}${unavailable.length > 3 ? ` and ${unavailable.length - 3} more` : ""}. Remove ${unavailable.length === 1 ? "it" : "them"} and try again.`);
    }

    const inserted = await this.db
      .from("order_requests")
      .insert({ tenant_id: tenantId, customer_id: userId, delivery_address: deliveryAddress, contact_phone: contactPhone, note })
      .select("id, order_number, status")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const order = inserted.data as { id: string; order_number: string; status: OrderRequestStatus };

    const lines = [...found].map(([key, item]) => ({
      order_request_id: order.id,
      item_key: key,
      item_name: item!.displayName,
      category: item!.displayCategory,
      brand: item!.brand,
      quantity: quantities.get(key)!,
      unit_price: item!.final_price,
      mrp: item!.mrp,
      stock_label: item!.stock_label
    }));
    const itemInsert = await this.db.from("order_request_items").insert(lines);
    if (itemInsert.error) {
      // Do not leave an order with no items behind.
      await this.db.from("order_requests").delete().eq("id", order.id);
      throw new Error(itemInsert.error.message);
    }

    const [admins, profile] = await Promise.all([
      this.listAdminIds(tenantId),
      this.db.from("users").select("full_name").eq("id", userId).maybeSingle()
    ]);
    const who = (profile.data?.full_name as string | undefined) || "A customer";
    await this.notify(
      tenantId,
      admins.filter((id) => id !== userId),
      `New order ${order.order_number}`,
      `${who} ordered ${lines.length} item${lines.length === 1 ? "" : "s"}. Open Orders to confirm it.`,
      { orderRequestId: order.id }
    );

    return { id: order.id, order_number: order.order_number, status: order.status, item_count: lines.length };
  }

  /**
   * Turns an accepted quotation into an order at the quoted prices. Stock is not checked:
   * the shop already agreed to supply these items when it sent the quotation.
   */
  async createFromQuotation(args: {
    tenantId: string;
    customerId: string;
    quotationNumber: string;
    deliveryAddress: string;
    contactPhone: string | null;
    note: string | null;
    lines: Array<{ item_key: string; item_name: string; category: string; brand: string | null; quantity: number; unit_price: number; mrp: number }>;
  }) {
    const inserted = await this.db
      .from("order_requests")
      .insert({
        tenant_id: args.tenantId,
        customer_id: args.customerId,
        delivery_address: args.deliveryAddress,
        contact_phone: args.contactPhone,
        note: [`From quotation ${args.quotationNumber}`, args.note].filter(Boolean).join(". ")
      })
      .select("id, order_number, status")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const order = inserted.data as { id: string; order_number: string; status: OrderRequestStatus };

    const itemInsert = await this.db.from("order_request_items").insert(args.lines.map((line) => ({ ...line, order_request_id: order.id })));
    if (itemInsert.error) {
      await this.db.from("order_requests").delete().eq("id", order.id);
      throw new Error(itemInsert.error.message);
    }

    await this.notify(
      args.tenantId,
      (await this.listAdminIds(args.tenantId)).filter((id) => id !== args.customerId),
      `New order ${order.order_number}`,
      `Quotation ${args.quotationNumber} was accepted. Open Orders to confirm it.`,
      { orderRequestId: order.id }
    );
    return order;
  }

  async updateStatus(actor: RequestActor, orderId: string, body: Record<string, unknown>) {
    const { userId, tenantId, role } = await this.requireContext(actor);
    const status = body.status as OrderRequestStatus;
    if (!ORDER_REQUEST_STATUSES.includes(status)) throw new BadRequestException("Choose a valid status.");

    const current = await this.db.from("order_requests").select(ORDER_COLUMNS).eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    const order = current.data as OrderRow | null;
    if (!order) throw new NotFoundException("This order could not be found.");

    const isAdmin = isAdminRole(role);
    if (!isAdmin && order.customer_id !== userId) throw new NotFoundException("This order could not be found.");
    const party = isAdmin ? "admin" : "customer";
    if (!allowedOrderStatusChange(party, order.status, status)) {
      throw new ConflictException(
        party === "customer"
          ? "This order is already being prepared, so it can no longer be cancelled here. Please call the shop."
          : `An order that ${STATUS_MESSAGES[order.status]} cannot be marked ${status}.`
      );
    }

    const adminNote = isAdmin ? cleanText(body.admin_note, 500) || order.admin_note : order.admin_note;
    // Only move the order on if nobody else changed it meanwhile.
    const updated = await this.db
      .from("order_requests")
      .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", order.status)
      .select("id, status")
      .maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data) throw new ConflictException("This order was just updated by someone else. Refresh to see the latest.");

    if (isAdmin) {
      if (order.customer_id !== userId) {
        await this.notify(
          tenantId,
          [order.customer_id],
          `Order ${order.order_number} ${STATUS_MESSAGES[status]}`,
          adminNote ? `Note from the shop: ${adminNote}` : "Open My Orders for the details.",
          { orderRequestId: order.id, status }
        );
      }
    } else {
      const admins = await this.listAdminIds(tenantId);
      await this.notify(tenantId, admins, `Order ${order.order_number} cancelled`, "The customer cancelled this order.", { orderRequestId: order.id, status });
    }

    return { id: order.id, status };
  }
}
