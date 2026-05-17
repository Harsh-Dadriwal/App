import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type {
  CreateRequirementTextBatchRequestDto,
  GenerateRequirementProcurementRequestDto,
  ReviewRequirementBatchItemRequestDto
} from "@mahalaxmi/core/types/contracts";
import { SupabaseAuthGuard } from "../../common/auth/supabase-auth.guard";
import type { AuthenticatedRequest } from "../../common/auth/authenticated-request";
import { RequirementsService } from "./requirements.service";

type UploadedRequirementFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Controller("/api/v1/requirements")
@UseGuards(SupabaseAuthGuard)
export class RequirementsController {
  constructor(private readonly requirementsService: RequirementsService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return {
      data: await this.requirementsService.listBatches(request.actor!)
    };
  }

  @Get(":id")
  async getBatch(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return {
      data: await this.requirementsService.getBatch(request.actor!, id)
    };
  }

  @Post("text")
  async createTextBatch(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateRequirementTextBatchRequestDto
  ) {
    return {
      data: await this.requirementsService.createTextBatch(request.actor!, body)
    };
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  async createUploadBatch(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: UploadedRequirementFile,
    @Body()
    body: {
      site_id?: string | null;
      source_channel?: string | null;
      input_language?: string | null;
    }
  ) {
    return {
      data: await this.requirementsService.createUploadBatch(request.actor!, file, body)
    };
  }

  @Patch(":batchId/items/:itemId/review")
  async reviewItem(
    @Req() request: AuthenticatedRequest,
    @Param("batchId") batchId: string,
    @Param("itemId") itemId: string,
    @Body() body: ReviewRequirementBatchItemRequestDto
  ) {
    return {
      data: await this.requirementsService.reviewItem(request.actor!, batchId, itemId, body)
    };
  }

  @Post(":batchId/generate-procurement")
  async generateProcurement(
    @Req() request: AuthenticatedRequest,
    @Param("batchId") batchId: string,
    @Body() body: GenerateRequirementProcurementRequestDto
  ) {
    return {
      data: await this.requirementsService.generateProcurement(request.actor!, batchId, body)
    };
  }
}
