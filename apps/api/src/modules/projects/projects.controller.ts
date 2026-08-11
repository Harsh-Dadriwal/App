import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type {
  CreateProjectMemberRequestDto,
  CreateProjectRequestDto,
  CreateProjectRoomRequestDto,
  CreateProjectTaskRequestDto
} from "../../core";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import { ProjectsService } from "./projects.service";

@Controller("/api/v1/projects")
@UseGuards(SupabaseAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query("tenant_id") tenantId: string) {
    return { data: await this.projectsService.list(request.actor!, tenantId) };
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: CreateProjectRequestDto) {
    return { data: await this.projectsService.create(request.actor!, body) };
  }

  @Get(":id")
  async get(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return { data: await this.projectsService.get(request.actor!, id) };
  }

  @Get(":id/members")
  async listMembers(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return { data: await this.projectsService.listMembers(request.actor!, id) };
  }

  @Post(":id/members")
  async addMember(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: CreateProjectMemberRequestDto
  ) {
    return { data: await this.projectsService.addMember(request.actor!, id, body) };
  }

  @Get(":id/rooms")
  async listRooms(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return { data: await this.projectsService.listRooms(request.actor!, id) };
  }

  @Post(":id/rooms")
  async createRoom(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: CreateProjectRoomRequestDto
  ) {
    return { data: await this.projectsService.createRoom(request.actor!, id, body) };
  }

  @Get(":id/tasks")
  async listTasks(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return { data: await this.projectsService.listTasks(request.actor!, id) };
  }

  @Post(":id/tasks")
  async createTask(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: CreateProjectTaskRequestDto
  ) {
    return { data: await this.projectsService.createTask(request.actor!, id, body) };
  }
}
