import { Body, Controller, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { MAX_PHOTO_BYTES, type UploadedPhoto } from "./quotation-photos.service";
import { QuotationsService } from "./quotations.service";

@Controller("/api/v1/quotations")
@UseGuards(SupabaseAuthGuard)
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return { data: await this.quotations.list(request.actor!) };
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return { data: await this.quotations.create(request.actor!, body ?? {}) };
  }

  /** Multipart upload of one requirement-list photo (field "file"); returns its storage key. */
  @Post("/photos")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async uploadPhoto(@Req() request: AuthenticatedRequest, @UploadedFile() file: UploadedPhoto | undefined) {
    return { data: await this.quotations.uploadPhoto(request.actor!, file) };
  }

  @Post(":id/quote")
  async quote(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.quotations.quote(request.actor!, id, body ?? {}) };
  }

  @Post(":id/accept")
  async accept(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.quotations.accept(request.actor!, id, body ?? {}) };
  }

  @Post(":id/close")
  async close(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: Record<string, unknown>) {
    return { data: await this.quotations.close(request.actor!, id, body ?? {}) };
  }
}
