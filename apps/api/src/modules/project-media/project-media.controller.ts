import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { CreateProjectMediaUploadRequestDto } from "../../core";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import { ProjectMediaService } from "./project-media.service";

@Controller("/api/v1")
@UseGuards(SupabaseAuthGuard)
export class ProjectMediaController {
  constructor(private readonly projectMediaService: ProjectMediaService) {}

  @Post("/projects/:projectId/media/upload-url")
  async createUploadUrl(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
    @Body() body: CreateProjectMediaUploadRequestDto
  ) {
    return { data: await this.projectMediaService.createUploadUrl(request.actor!, projectId, body) };
  }

  @Post("/project-media/:mediaId/complete")
  async completeUpload(@Req() request: AuthenticatedRequest, @Param("mediaId") mediaId: string) {
    return { data: await this.projectMediaService.completeUpload(request.actor!, mediaId) };
  }

  @Get("/projects/:projectId/media")
  async list(
    @Req() request: AuthenticatedRequest,
    @Param("projectId") projectId: string,
    @Query("context_type") contextType?: string,
    @Query("context_id") contextId?: string
  ) {
    return { data: await this.projectMediaService.list(request.actor!, projectId, { contextType, contextId }) };
  }

  @Get("/project-media/:mediaId/download-url")
  async createDownloadUrl(@Req() request: AuthenticatedRequest, @Param("mediaId") mediaId: string) {
    return { data: await this.projectMediaService.createDownloadUrl(request.actor!, mediaId) };
  }
}
