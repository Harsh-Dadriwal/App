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

export const SERVICE_REQUEST_TYPES = ["complaint", "installation"] as const;
export type ServiceRequestType = (typeof SERVICE_REQUEST_TYPES)[number];
export type ServiceRequestStatus = "open" | "assigned" | "in_progress" | "completed" | "cancelled";

type RequestRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  request_type: ServiceRequestType;
  title: string;
  description: string;
  address: string;
  city: string | null;
  contact_phone: string | null;
  preferred_date: string | null;
  status: ServiceRequestStatus;
  assigned_electrician_id: string | null;
  assigned_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type ResponseRow = {
  id: string;
  service_request_id: string;
  electrician_id: string;
  message: string | null;
  quoted_amount: number | null;
  status: "offered" | "chosen" | "not_chosen";
  created_at: string;
};

type UserRow = {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  verification_status: string | null;
};

const REQUEST_COLUMNS =
  "id, tenant_id, customer_id, request_type, title, description, address, city, contact_phone, preferred_date, status, assigned_electrician_id, assigned_at, completed_at, created_at";
const RESPONSE_COLUMNS = "id, service_request_id, electrician_id, message, quoted_amount, status, created_at";
const TYPE_LABELS: Record<ServiceRequestType, string> = { complaint: "complaint", installation: "installation request" };

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/** Which status changes each party may make, and from which current statuses. */
export function allowedStatusChange(
  party: "customer" | "electrician" | "admin",
  from: ServiceRequestStatus,
  to: ServiceRequestStatus
) {
  const rules: Record<typeof party, Partial<Record<ServiceRequestStatus, ServiceRequestStatus[]>>> = {
    customer: { cancelled: ["open", "assigned"], completed: ["assigned", "in_progress"] },
    electrician: { in_progress: ["assigned"], completed: ["assigned", "in_progress"] },
    admin: { cancelled: ["open", "assigned", "in_progress"], in_progress: ["assigned"], completed: ["assigned", "in_progress"] }
  };
  return rules[party][to]?.includes(from) ?? false;
}

@Injectable()
export class ServiceRequestsService {
  private readonly logger = new Logger(ServiceRequestsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly notificationsService: NotificationsService
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
    return { userId: actor.appUserId, tenantId, role: actor.role ?? "" };
  }

  private async getRequest(tenantId: string, requestId: string) {
    const result = await this.db.from("service_requests").select(REQUEST_COLUMNS).eq("id", requestId).eq("tenant_id", tenantId).maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new NotFoundException("This request could not be found.");
    return result.data as RequestRow;
  }

  private async getUsers(ids: Array<string | null | undefined>) {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!unique.length) return new Map<string, UserRow>();
    const result = await this.db.from("users").select("id, full_name, phone, city, verification_status").in("id", unique);
    if (result.error) throw new Error(result.error.message);
    return new Map((result.data as UserRow[]).map((user) => [user.id, user]));
  }

  /** Never lets a failed notification undo the action that triggered it. */
  private async notify(tenantId: string, userIds: string[], title: string, body: string, data: Record<string, unknown>) {
    try {
      await this.notificationsService.createBulkNotifications({ tenantId, userIds, title, body, data: { module: "service_requests", ...data } });
      return userIds.length;
    } catch (error) {
      this.logger.warn(`Service request notification failed: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }
  }

  private async listElectricianIds(tenantId: string) {
    const memberships = await this.db
      .from("tenant_memberships")
      .select("user_id, role")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);
    if (memberships.error) throw new Error(memberships.error.message);

    const memberIds = (memberships.data ?? []).map((row) => row.user_id as string);
    if (!memberIds.length) return [];
    const electricianMemberships = new Set(
      (memberships.data ?? []).filter((row) => row.role === "electrician").map((row) => row.user_id as string)
    );

    const users = await this.db.from("users").select("id, role").in("id", memberIds).eq("status", "active");
    if (users.error) throw new Error(users.error.message);
    return (users.data ?? [])
      .filter((user) => user.role === "electrician" || electricianMemberships.has(user.id))
      .map((user) => user.id as string);
  }

  async list(actor: RequestActor) {
    const { userId, tenantId, role } = await this.requireContext(actor);
    if (!["customer", "electrician", "admin"].includes(role)) {
      throw new ForbiddenException("Service requests are available to customers and electricians.");
    }

    let query = this.db.from("service_requests").select(REQUEST_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
    if (role === "customer") query = query.eq("customer_id", userId);
    if (role === "electrician") query = query.or(`status.eq.open,assigned_electrician_id.eq.${userId}`);
    const requests = await query;
    if (requests.error) throw new Error(requests.error.message);
    const rows = (requests.data ?? []) as RequestRow[];

    let responses: ResponseRow[] = [];
    if (rows.length) {
      let responseQuery = this.db.from("service_request_responses").select(RESPONSE_COLUMNS).in("service_request_id", rows.map((row) => row.id)).order("created_at");
      if (role === "electrician") responseQuery = responseQuery.eq("electrician_id", userId);
      const responseResult = await responseQuery;
      if (responseResult.error) throw new Error(responseResult.error.message);
      responses = (responseResult.data ?? []) as ResponseRow[];
    }

    const users = await this.getUsers([
      ...rows.flatMap((row) => [row.customer_id, row.assigned_electrician_id]),
      ...responses.map((response) => response.electrician_id)
    ]);

    return {
      role,
      requests: rows.map((row) => {
        // Electricians only see where and how to reach the customer once they are chosen.
        const canSeeContact = role !== "electrician" || row.assigned_electrician_id === userId;
        const customer = users.get(row.customer_id);
        const assignee = row.assigned_electrician_id ? users.get(row.assigned_electrician_id) : undefined;
        return {
          id: row.id,
          request_type: row.request_type,
          title: row.title,
          description: row.description,
          city: row.city,
          address: canSeeContact ? row.address : null,
          contact_phone: canSeeContact ? row.contact_phone ?? customer?.phone ?? null : null,
          preferred_date: row.preferred_date,
          status: row.status,
          created_at: row.created_at,
          assigned_at: row.assigned_at,
          completed_at: row.completed_at,
          customer_name: customer?.full_name ?? null,
          assigned_electrician: assignee
            ? { id: assignee.id, full_name: assignee.full_name, phone: assignee.phone, verified: assignee.verification_status === "verified" }
            : null,
          responses: responses
            .filter((response) => response.service_request_id === row.id)
            .map((response) => {
              const electrician = users.get(response.electrician_id);
              return {
                id: response.id,
                electrician_id: response.electrician_id,
                electrician_name: electrician?.full_name ?? "Electrician",
                electrician_phone: electrician?.phone ?? null,
                electrician_city: electrician?.city ?? null,
                verified: electrician?.verification_status === "verified",
                message: response.message,
                quoted_amount: response.quoted_amount === null ? null : Number(response.quoted_amount),
                status: response.status,
                created_at: response.created_at
              };
            })
        };
      })
    };
  }

  async create(actor: RequestActor, body: Record<string, unknown>) {
    const { userId, tenantId, role } = await this.requireContext(actor);
    if (role !== "customer") {
      throw new ForbiddenException("Only customers can raise complaints and installation requests.");
    }

    const requestType = body.request_type as ServiceRequestType;
    const title = cleanText(body.title, 150);
    const description = cleanText(body.description, 2000);
    const address = cleanText(body.address, 500);
    const city = cleanText(body.city, 100) || null;
    const contactPhone = cleanText(body.contact_phone, 20) || null;
    const preferredDate = cleanText(body.preferred_date, 10) || null;

    if (!SERVICE_REQUEST_TYPES.includes(requestType)) throw new BadRequestException("Choose whether this is a complaint or an installation.");
    if (title.length < 3) throw new BadRequestException("Add a short title (at least 3 characters).");
    if (description.length < 5) throw new BadRequestException("Describe the problem or the installation you need.");
    if (!address) throw new BadRequestException("Add the address where the work is needed.");
    if (contactPhone && !/^\+?[0-9 -]{7,20}$/.test(contactPhone)) throw new BadRequestException("Enter a valid contact number.");
    if (preferredDate && (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || Number.isNaN(Date.parse(preferredDate)))) {
      throw new BadRequestException("Enter a valid preferred date.");
    }

    const inserted = await this.db
      .from("service_requests")
      .insert({
        tenant_id: tenantId,
        customer_id: userId,
        request_type: requestType,
        title,
        description,
        address,
        city,
        contact_phone: contactPhone,
        preferred_date: preferredDate
      })
      .select(REQUEST_COLUMNS)
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    const request = inserted.data as RequestRow;

    const electricianIds = (await this.listElectricianIds(tenantId)).filter((id) => id !== userId);
    const notifiedCount = await this.notify(
      tenantId,
      electricianIds,
      requestType === "complaint" ? "New complaint" : "New installation request",
      `${title}${city ? ` in ${city}` : ""}. Open Service Requests to offer to take it.`,
      { serviceRequestId: request.id }
    );

    return { id: request.id, status: request.status, notifiedCount };
  }

  async respond(actor: RequestActor, requestId: string, body: Record<string, unknown>) {
    const { userId, tenantId, role } = await this.requireContext(actor);
    if (role !== "electrician") {
      throw new ForbiddenException("Only electricians can offer to take a request.");
    }

    const request = await this.getRequest(tenantId, requestId);
    if (request.status !== "open") {
      throw new ConflictException("This request has already been given to an electrician.");
    }

    const message = cleanText(body.message, 1000) || null;
    const rawAmount = body.quoted_amount;
    const quotedAmount = rawAmount === null || rawAmount === undefined || rawAmount === "" ? null : Number(rawAmount);
    if (quotedAmount !== null && (!Number.isFinite(quotedAmount) || quotedAmount < 0)) {
      throw new BadRequestException("Enter a valid amount, or leave it empty.");
    }

    const existing = await this.db
      .from("service_request_responses")
      .select("id")
      .eq("service_request_id", requestId)
      .eq("electrician_id", userId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);

    const saved = await this.db
      .from("service_request_responses")
      .upsert(
        { service_request_id: requestId, electrician_id: userId, message, quoted_amount: quotedAmount, status: "offered", updated_at: new Date().toISOString() },
        { onConflict: "service_request_id,electrician_id" }
      )
      .select("id")
      .single();
    if (saved.error) throw new Error(saved.error.message);

    if (!existing.data) {
      const electrician = (await this.getUsers([userId])).get(userId);
      await this.notify(
        tenantId,
        [request.customer_id],
        "An electrician can help",
        `${electrician?.full_name ?? "An electrician"} offered to take your ${TYPE_LABELS[request.request_type]} "${request.title}".`,
        { serviceRequestId: requestId }
      );
    }

    return { id: saved.data.id, requestId };
  }

  async choose(actor: RequestActor, requestId: string, body: Record<string, unknown>) {
    const { userId, tenantId, role } = await this.requireContext(actor);
    const request = await this.getRequest(tenantId, requestId);
    if (request.customer_id !== userId && role !== "admin") {
      throw new ForbiddenException("Only the customer who raised this request can choose an electrician.");
    }
    if (request.status !== "open") {
      throw new ConflictException("An electrician has already been chosen for this request.");
    }

    const responseId = cleanText(body.response_id, 64);
    const responses = await this.db.from("service_request_responses").select(RESPONSE_COLUMNS).eq("service_request_id", requestId);
    if (responses.error) throw new Error(responses.error.message);
    const all = (responses.data ?? []) as ResponseRow[];
    const chosen = all.find((response) => response.id === responseId);
    if (!chosen) throw new BadRequestException("Choose one of the electricians who offered to help.");

    const now = new Date().toISOString();
    // Guarded on status so two quick taps cannot assign the request twice.
    const assigned = await this.db
      .from("service_requests")
      .update({ status: "assigned", assigned_electrician_id: chosen.electrician_id, assigned_at: now, updated_at: now })
      .eq("id", requestId)
      .eq("status", "open")
      .select("id");
    if (assigned.error) throw new Error(assigned.error.message);
    if (!assigned.data?.length) throw new ConflictException("An electrician has already been chosen for this request.");

    const chosenUpdate = await this.db.from("service_request_responses").update({ status: "chosen", updated_at: now }).eq("id", chosen.id);
    if (chosenUpdate.error) throw new Error(chosenUpdate.error.message);
    const othersUpdate = await this.db
      .from("service_request_responses")
      .update({ status: "not_chosen", updated_at: now })
      .eq("service_request_id", requestId)
      .neq("id", chosen.id);
    if (othersUpdate.error) throw new Error(othersUpdate.error.message);

    await this.notify(
      tenantId,
      [chosen.electrician_id],
      "You got the job",
      `The customer chose you for "${request.title}". Open Service Requests for the address and contact number.`,
      { serviceRequestId: requestId }
    );
    await this.notify(
      tenantId,
      all.filter((response) => response.id !== chosen.id).map((response) => response.electrician_id),
      "Request taken",
      `The customer chose another electrician for "${request.title}".`,
      { serviceRequestId: requestId }
    );

    return { id: requestId, status: "assigned" as const, assignedElectricianId: chosen.electrician_id };
  }

  async updateStatus(actor: RequestActor, requestId: string, body: Record<string, unknown>) {
    const { userId, tenantId, role } = await this.requireContext(actor);
    const request = await this.getRequest(tenantId, requestId);
    const to = body.status as ServiceRequestStatus;

    const party = role === "admin"
      ? "admin"
      : request.customer_id === userId
        ? "customer"
        : request.assigned_electrician_id === userId
          ? "electrician"
          : null;
    if (!party) throw new ForbiddenException("You cannot change this request.");
    if (!allowedStatusChange(party, request.status, to)) {
      throw new ConflictException("This request cannot be moved to that status right now.");
    }

    const now = new Date().toISOString();
    const updated = await this.db
      .from("service_requests")
      .update({
        status: to,
        updated_at: now,
        ...(to === "completed" ? { completed_at: now } : {}),
        ...(to === "cancelled" ? { cancelled_at: now } : {})
      })
      .eq("id", requestId)
      .eq("status", request.status)
      .select("id");
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data?.length) throw new ConflictException("This request was just updated. Refresh and try again.");

    const label = { in_progress: "started", completed: "marked as completed", cancelled: "cancelled", open: "reopened", assigned: "assigned" }[to];
    const recipients = party === "electrician"
      ? [request.customer_id]
      : request.assigned_electrician_id
        ? [request.assigned_electrician_id]
        : [];
    await this.notify(tenantId, recipients, "Request updated", `"${request.title}" was ${label}.`, { serviceRequestId: requestId });

    return { id: requestId, status: to };
  }
}
