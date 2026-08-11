import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type {
  CreateProjectMemberRequestDto,
  CreateProjectRequestDto,
  CreateProjectRoomRequestDto,
  CreateProjectTaskRequestDto
} from "@mahalaxmi/core";
import type { RequestActor } from "../../common/auth/auth.types";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";

type ProjectRow = {
  id: string;
  tenant_id: string;
  customer_id: string | null;
  created_by: string | null;
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService
  ) {}

  private requireProfile(actor: RequestActor) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("App profile not linked.");
    }
    return actor.appUserId;
  }

  private async getProject(actor: RequestActor, projectId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("projects")
      .select("id, tenant_id, customer_id, created_by")
      .eq("id", projectId)
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new NotFoundException("Project not found.");

    const project = result.data as ProjectRow;
    await this.tenantAccess.assertTenantAccess(actor, project.tenant_id);
    await this.assertProjectAccess(actor, project);
    return project;
  }

  private async assertProjectAccess(actor: RequestActor, project: ProjectRow) {
    const userId = this.requireProfile(actor);
    if (actor.role === "admin" || project.customer_id === userId || project.created_by === userId) return;

    const membership = await this.supabaseAdmin
      .getClient()
      .from("project_members")
      .select("id")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (membership.error) throw new Error(membership.error.message);
    if (!membership.data) throw new ForbiddenException("You do not have access to this project.");
  }

  private async assertProjectManager(actor: RequestActor, project: ProjectRow) {
    const userId = this.requireProfile(actor);
    if (actor.role === "admin" || project.customer_id === userId || project.created_by === userId) return;
    throw new ForbiddenException("Only the project owner or a tenant admin can manage this project.");
  }

  async list(actor: RequestActor, tenantId: string) {
    if (!tenantId) throw new BadRequestException("tenant_id is required.");
    const userId = this.requireProfile(actor);
    await this.tenantAccess.assertTenantAccess(actor, tenantId);

    const client = this.supabaseAdmin.getClient();
    if (actor.role === "admin") {
      const result = await client.from("projects").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
      if (result.error) throw new Error(result.error.message);
      return result.data ?? [];
    }

    const memberships = await client
      .from("project_members")
      .select("project_id")
      .eq("user_id", userId)
      .eq("status", "active");
    if (memberships.error) throw new Error(memberships.error.message);

    const memberProjectIds = (memberships.data ?? []).map((row) => row.project_id);
    const owned = await client
      .from("projects")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(`customer_id.eq.${userId},created_by.eq.${userId}`);
    if (owned.error) throw new Error(owned.error.message);

    const ownedIds = (owned.data ?? []).map((project) => project.id);
    const projectIds = [...new Set([...memberProjectIds, ...ownedIds])];
    if (!projectIds.length) return [];

    const result = await client
      .from("projects")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", projectIds)
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  }

  async get(actor: RequestActor, projectId: string) {
    const project = await this.getProject(actor, projectId);
    const result = await this.supabaseAdmin.getClient().from("projects").select("*").eq("id", project.id).single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async create(actor: RequestActor, body: CreateProjectRequestDto) {
    const userId = this.requireProfile(actor);
    if (!body.tenant_id || !body.project_code?.trim() || !body.name?.trim()) {
      throw new BadRequestException("tenant_id, project_code, and name are required.");
    }
    await this.tenantAccess.assertTenantAccess(actor, body.tenant_id);

    const insert = await this.supabaseAdmin
      .getClient()
      .from("projects")
      .insert({
        ...body,
        project_code: body.project_code.trim(),
        name: body.name.trim(),
        customer_id: body.customer_id ?? userId,
        created_by: userId
      })
      .select("*")
      .single();
    if (insert.error) throw new Error(insert.error.message);

    const membership = await this.supabaseAdmin.getClient().from("project_members").insert({
      project_id: insert.data.id,
      user_id: userId,
      role_key: actor.role ?? "project_manager",
      status: "active",
      joined_at: new Date().toISOString()
    });
    if (membership.error) throw new Error(membership.error.message);
    return insert.data;
  }

  async listMembers(actor: RequestActor, projectId: string) {
    const project = await this.getProject(actor, projectId);
    const result = await this.supabaseAdmin
      .getClient()
      .from("project_members")
      .select("*, user:users(id, full_name, email, phone, company_name)")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  }

  async addMember(actor: RequestActor, projectId: string, body: CreateProjectMemberRequestDto) {
    const project = await this.getProject(actor, projectId);
    await this.assertProjectManager(actor, project);
    if (!body.user_id || !body.role_key?.match(/^[a-z][a-z0-9_]{1,63}$/)) {
      throw new BadRequestException("A user_id and valid role_key are required.");
    }

    const role = await this.supabaseAdmin
      .getClient()
      .from("platform_roles")
      .select("id")
      .eq("tenant_id", project.tenant_id)
      .eq("role_key", body.role_key)
      .eq("is_active", true)
      .maybeSingle();
    if (role.error) throw new Error(role.error.message);
    if (!role.data) throw new BadRequestException("Role is not configured for this tenant.");

    const result = await this.supabaseAdmin
      .getClient()
      .from("project_members")
      .upsert(
        {
          project_id: project.id,
          user_id: body.user_id,
          role_key: body.role_key,
          permission_overrides: body.permission_overrides ?? [],
          status: "active",
          joined_at: new Date().toISOString(),
          removed_at: null
        },
        { onConflict: "project_id,user_id,role_key" }
      )
      .select("*")
      .single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async listRooms(actor: RequestActor, projectId: string) {
    const project = await this.getProject(actor, projectId);
    const result = await this.supabaseAdmin.getClient().from("project_rooms").select("*").eq("project_id", project.id).order("sort_order");
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  }

  async createRoom(actor: RequestActor, projectId: string, body: CreateProjectRoomRequestDto) {
    const project = await this.getProject(actor, projectId);
    await this.assertProjectManager(actor, project);
    if (!body.name?.trim()) throw new BadRequestException("Room name is required.");

    const result = await this.supabaseAdmin
      .getClient()
      .from("project_rooms")
      .insert({ ...body, name: body.name.trim(), project_id: project.id })
      .select("*")
      .single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async listTasks(actor: RequestActor, projectId: string) {
    const project = await this.getProject(actor, projectId);
    const result = await this.supabaseAdmin
      .getClient()
      .from("project_tasks")
      .select("*, assignees:project_task_assignees(user_id)")
      .eq("project_id", project.id)
      .order("deadline", { ascending: true });
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  }

  async createTask(actor: RequestActor, projectId: string, body: CreateProjectTaskRequestDto) {
    const userId = this.requireProfile(actor);
    const project = await this.getProject(actor, projectId);
    await this.assertProjectManager(actor, project);
    if (!body.title?.trim()) throw new BadRequestException("Task title is required.");

    const { assignee_ids = [], ...task } = body;
    const insert = await this.supabaseAdmin
      .getClient()
      .from("project_tasks")
      .insert({ ...task, title: body.title.trim(), project_id: project.id, created_by: userId })
      .select("*")
      .single();
    if (insert.error) throw new Error(insert.error.message);

    if (assignee_ids.length) {
      const uniqueAssigneeIds = [...new Set(assignee_ids)];
      const members = await this.supabaseAdmin
        .getClient()
        .from("project_members")
        .select("user_id")
        .eq("project_id", project.id)
        .eq("status", "active")
        .in("user_id", uniqueAssigneeIds);
      if (members.error) throw new Error(members.error.message);
      if ((members.data ?? []).length !== uniqueAssigneeIds.length) {
        throw new BadRequestException("Every task assignee must be an active project member.");
      }

      const assignments = await this.supabaseAdmin.getClient().from("project_task_assignees").insert(
        uniqueAssigneeIds.map((assigneeId) => ({ task_id: insert.data.id, user_id: assigneeId, assigned_by: userId }))
      );
      if (assignments.error) throw new Error(assignments.error.message);
    }

    return insert.data;
  }
}
