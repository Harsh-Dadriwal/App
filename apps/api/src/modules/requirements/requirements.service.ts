import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException
} from "@nestjs/common";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import {
  REQUIREMENT_BATCH_STATUS,
  REQUIREMENT_REVIEW_STATUS,
  REQUIREMENT_SOURCE_TYPE,
  type RequirementBatchStatus,
  type RequirementReviewStatus,
  type RequirementSourceType
} from "@mahalaxmi/core/types/domain";
import type {
  CreateRequirementTextBatchRequestDto,
  GenerateRequirementProcurementRequestDto,
  ReviewRequirementBatchItemRequestDto
} from "@mahalaxmi/core/types/contracts";
import type { RequestActor } from "../../common/auth/auth.types";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { QUEUE_NAMES } from "../../common/queue/queue.constants";
import { QueueService } from "../../common/queue/queue.service";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { TenantAccessService } from "../../common/tenancy/tenant-access.service";
import { RequirementOcrService } from "./requirement-ocr.service";

export const REQUIREMENT_PREPROCESS_JOB = "requirement-batch-preprocess";
export const REQUIREMENT_EXTRACT_JOB = "requirement-batch-extract";
export const REQUIREMENT_MATCH_JOB = "requirement-batch-match";
export const REQUIREMENT_OCR_JOB = "requirement-batch-ocr";

type RequirementBatchRow = {
  id: string;
  tenant_id: string;
  site_id: string | null;
  created_by: string | null;
  source_channel: string;
  status: string;
  review_status: string;
  input_language: string | null;
  overall_confidence: number | null;
  generated_site_order_id: string | null;
  created_at: string;
  updated_at: string;
};

type RequirementBatchSourceRow = {
  id: string;
  requirement_batch_id: string;
  tenant_id: string;
  source_type: RequirementSourceType;
  mime_type: string | null;
  original_filename: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  public_url: string | null;
  raw_text: string | null;
  metadata_json: Record<string, unknown> | null;
};

type UploadedRequirementFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

type ExtractedItemDraft = {
  sourceId: string | null;
  sourcePage?: number | null;
  sourceLineNumber?: number | null;
  rawText: string;
  normalizedText: string | null;
  extractedQuantity: number | null;
  extractedUnit: string | null;
  extractedBrand: string | null;
  extractedSpecifications: string | null;
  extractedDimensions: string | null;
  extractedCategory: string | null;
  extractionConfidence: number;
  reviewStatus: RequirementReviewStatus;
  sourceCoordinates?: Record<string, unknown> | null;
};

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[|,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function inferSourceType(filename?: string | null, mimeType?: string | null): RequirementSourceType {
  const lowerFilename = filename?.toLowerCase() ?? "";
  const lowerMime = mimeType?.toLowerCase() ?? "";

  if (lowerFilename.endsWith(".xlsx") || lowerMime.includes("spreadsheetml")) {
    return REQUIREMENT_SOURCE_TYPE.XLSX;
  }
  if (lowerFilename.endsWith(".csv") || lowerMime.includes("csv")) {
    return REQUIREMENT_SOURCE_TYPE.CSV;
  }
  if (lowerFilename.endsWith(".pdf") || lowerMime.includes("pdf")) {
    return REQUIREMENT_SOURCE_TYPE.PDF;
  }
  if (lowerMime.startsWith("image/")) {
    return REQUIREMENT_SOURCE_TYPE.IMAGE;
  }

  return REQUIREMENT_SOURCE_TYPE.MIXED_NOTE;
}

function parseQuantityAndUnit(line: string) {
  const quantityMatch = line.match(/(\d+(?:\.\d+)?)/);
  const unitMatch = line.match(/\b(pcs|pc|box|set|pair|m|mm|sqmm|sq|kg|ltr|roll|bundle|nos?)\b/i);

  return {
    quantity: quantityMatch ? Number(quantityMatch[1]) : null,
    unit: unitMatch ? unitMatch[1].toLowerCase() : null
  };
}

function detectBrand(line: string) {
  const knownBrands = ["havells", "anchor", "polycab", "finolex", "legrand", "schneider"];
  const normalized = normalizeText(line);
  return knownBrands.find((brand) => normalized.includes(brand)) ?? null;
}

function detectCategory(line: string) {
  const normalized = normalizeText(line);
  if (normalized.includes("wire") || normalized.includes("cable")) return "wiring";
  if (normalized.includes("switch") || normalized.includes("socket")) return "switches";
  if (normalized.includes("pipe") || normalized.includes("conduit")) return "conduit";
  if (normalized.includes("light") || normalized.includes("lamp")) return "lighting";
  return null;
}

function isMissingRequirementSchemaError(message: string) {
  return /relation .*requirement_batch/i.test(message) || /column .*requirement_batch/i.test(message);
}

@Injectable()
export class RequirementsService {
  private readonly logger = new Logger(RequirementsService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly tenantAccess: TenantAccessService,
    private readonly queueService: QueueService,
    private readonly domainEvents: DomainEventsService,
    private readonly requirementOcrService: RequirementOcrService
  ) {}

  private get storageMode() {
    return process.env.R2_BUCKET && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
      ? "r2"
      : "s3";
  }

  private getStorageClient() {
    if (this.storageMode === "r2") {
      const accountId = process.env.R2_ACCOUNT_ID;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error("R2 storage is not fully configured.");
      }

      return new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey }
      });
    }

    if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error("Storage is not configured.");
    }

    return new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }

  private getStorageBucket() {
    const bucket = this.storageMode === "r2" ? process.env.R2_BUCKET : process.env.AWS_S3_BUCKET;
    if (!bucket) {
      throw new Error("Storage bucket is not configured.");
    }
    return bucket;
  }

  private getPublicBaseUrl() {
    const baseUrl =
      this.storageMode === "r2"
        ? process.env.R2_PUBLIC_BASE_URL
        : process.env.AWS_S3_PUBLIC_BASE_URL;
    return baseUrl?.replace(/\/$/, "") ?? null;
  }

  private async requireTenant(actor: RequestActor) {
    if (!actor.appUserId) {
      throw new UnauthorizedException("App profile not linked.");
    }

    if (!actor.defaultTenantId) {
      throw new BadRequestException("No active tenant selected.");
    }

    await this.tenantAccess.assertTenantAccess(actor, actor.defaultTenantId);
    return actor.defaultTenantId;
  }

  private async assertReviewAccess(actor: RequestActor, tenantId: string) {
    if (!["admin", "architect"].includes(actor.role ?? "")) {
      throw new ForbiddenException("Admin or architect access required.");
    }
    await this.tenantAccess.assertTenantAccess(actor, tenantId);
  }

  private async insertBatch(args: {
    tenantId: string;
    createdBy: string;
    siteId?: string | null;
    sourceChannel: string;
    inputLanguage?: string | null;
    notes?: string | null;
  }) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batches")
      .insert({
        tenant_id: args.tenantId,
        created_by: args.createdBy,
        site_id: args.siteId ?? null,
        source_channel: args.sourceChannel,
        input_language: args.inputLanguage ?? null,
        notes: args.notes ?? null,
        status: REQUIREMENT_BATCH_STATUS.QUEUED,
        review_status: REQUIREMENT_REVIEW_STATUS.PENDING
      })
      .select("*")
      .single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data as RequirementBatchRow;
  }

  private async insertSource(args: {
    batchId: string;
    tenantId: string;
    sourceType: RequirementSourceType;
    mimeType?: string | null;
    originalFilename?: string | null;
    storageBucket?: string | null;
    storageKey?: string | null;
    publicUrl?: string | null;
    rawText?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_sources")
      .insert({
        requirement_batch_id: args.batchId,
        tenant_id: args.tenantId,
        source_type: args.sourceType,
        mime_type: args.mimeType ?? null,
        original_filename: args.originalFilename ?? null,
        storage_bucket: args.storageBucket ?? null,
        storage_key: args.storageKey ?? null,
        public_url: args.publicUrl ?? null,
        raw_text: args.rawText ?? null,
        metadata_json: args.metadata ?? null
      })
      .select("*")
      .single();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data as RequirementBatchSourceRow;
  }

  private async logStage(args: {
    batchId: string;
    tenantId: string;
    stage: string;
    status: string;
    workerName: string;
    inputPayload?: Record<string, unknown> | null;
    outputPayload?: Record<string, unknown> | null;
    errorMessage?: string | null;
  }) {
    await this.supabaseAdmin.getClient().from("requirement_batch_processing_jobs").insert({
      requirement_batch_id: args.batchId,
      tenant_id: args.tenantId,
      stage: args.stage,
      status: args.status,
      worker_name: args.workerName,
      input_payload: args.inputPayload ?? null,
      output_payload: args.outputPayload ?? null,
      error_message: args.errorMessage ?? null,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    });
  }

  private async updateBatchStatus(batchId: string, updates: Record<string, unknown>) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batches")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("id", batchId);

    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  private async clearBatchArtifacts(batchId: string) {
    const itemResult = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .select("id")
      .eq("requirement_batch_id", batchId);

    if (itemResult.error) {
      throw new Error(itemResult.error.message);
    }

    const itemIds = (itemResult.data ?? []).map((item: { id: string }) => item.id);

    if (itemIds.length) {
      const candidatesDelete = await this.supabaseAdmin
        .getClient()
        .from("requirement_batch_item_candidates")
        .delete()
        .in("requirement_batch_item_id", itemIds);

      if (candidatesDelete.error) {
        throw new Error(candidatesDelete.error.message);
      }
    }

    const itemsDelete = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .delete()
      .eq("requirement_batch_id", batchId);

    if (itemsDelete.error) {
      throw new Error(itemsDelete.error.message);
    }
  }

  private async enqueueOrRun(
    queueName: string,
    jobName: string,
    payload: Record<string, unknown>,
    runner: () => Promise<void>
  ) {
    const result = await this.queueService.enqueue(queueName, jobName, payload, {
      jobId: `${jobName}:${payload.batchId ?? payload.sourceId ?? Date.now()}`,
      removeOnComplete: true
    });

    if ((result as any)?.skipped) {
      await runner();
    }
  }

  /**
   * Fire-and-forget: kick off the processing pipeline in the background.
   * Any errors are caught, logged, and the batch status set to 'failed'.
   * The caller does NOT await this — the HTTP response returns immediately.
   */
  private fireAndForgetPipeline(batchId: string, actorId?: string | null) {
    // Intentionally NOT awaited by the caller
    this.runPreprocessStage(batchId, actorId).catch(async (err: any) => {
      this.logger.error(
        `Pipeline failed for batch ${batchId}: ${err?.message ?? String(err)}`
      );
      try {
        await this.updateBatchStatus(batchId, {
          status: REQUIREMENT_BATCH_STATUS.FAILED
        });
      } catch (_e) {
        // best-effort
      }
    });
  }

  private async persistExtractedItems(batch: RequirementBatchRow, items: ExtractedItemDraft[]) {
    if (!items.length) {
      return [];
    }

    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .insert(
        items.map((item) => ({
          requirement_batch_id: batch.id,
          tenant_id: batch.tenant_id,
          source_id: item.sourceId,
          source_page: item.sourcePage ?? null,
          source_line_number: item.sourceLineNumber ?? null,
          raw_text: item.rawText,
          normalized_text: item.normalizedText,
          extracted_quantity: item.extractedQuantity,
          extracted_unit: item.extractedUnit,
          extracted_brand: item.extractedBrand,
          extracted_specifications: item.extractedSpecifications,
          extracted_dimensions: item.extractedDimensions,
          extracted_category: item.extractedCategory,
          extraction_confidence: item.extractionConfidence,
          review_status: item.reviewStatus,
          source_coordinates: item.sourceCoordinates ?? null
        }))
      )
      .select("*");

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data ?? [];
  }

  private parsePlainText(rawText: string, sourceId: string): ExtractedItemDraft[] {
    return rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const { quantity, unit } = parseQuantityAndUnit(line);
        return {
          sourceId,
          sourceLineNumber: index + 1,
          rawText: line,
          normalizedText: normalizeText(line),
          extractedQuantity: quantity,
          extractedUnit: unit,
          extractedBrand: detectBrand(line),
          extractedSpecifications: null,
          extractedDimensions: null,
          extractedCategory: detectCategory(line),
          extractionConfidence: quantity || unit ? 0.82 : 0.58,
          reviewStatus: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
        };
      });
  }

  private parseCsv(rawText: string, sourceId: string): ExtractedItemDraft[] {
    const lines = rawText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines.map((line, index) => {
      const cells = line.split(",").map((cell) => cell.trim());
      const merged = cells.join(" ");
      const quantityCell = cells.find((cell) => /\d/.test(cell)) ?? "";
      const quantityInfo = parseQuantityAndUnit(quantityCell || merged);

      return {
        sourceId,
        sourceLineNumber: index + 1,
        rawText: line,
        normalizedText: normalizeText(merged),
        extractedQuantity: quantityInfo.quantity,
        extractedUnit: quantityInfo.unit,
        extractedBrand: detectBrand(merged),
        extractedSpecifications: cells.slice(2).join(" ") || null,
        extractedDimensions: null,
        extractedCategory: detectCategory(merged),
        extractionConfidence: 0.74,
        reviewStatus: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
      };
    });
  }

  private createManualReviewPlaceholder(source: RequirementBatchSourceRow): ExtractedItemDraft[] {
    return [
      {
        sourceId: source.id,
        rawText: source.original_filename
          ? `Manual review required for ${source.original_filename}`
          : "Manual review required for uploaded requirement source",
        normalizedText: null,
        extractedQuantity: null,
        extractedUnit: null,
        extractedBrand: null,
        extractedSpecifications: null,
        extractedDimensions: null,
        extractedCategory: null,
        extractionConfidence: 0.18,
        reviewStatus: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
      }
    ];
  }

  private isOcrSource(source: RequirementBatchSourceRow) {
    switch (source.source_type) {
      case REQUIREMENT_SOURCE_TYPE.IMAGE:
      case REQUIREMENT_SOURCE_TYPE.HANDWRITTEN_IMAGE:
      case REQUIREMENT_SOURCE_TYPE.WHATSAPP_SCREENSHOT:
        return true;
      default:
        return false;
    }
  }

  private async fetchSourceBuffer(source: any): Promise<Buffer> {
    if (!source.storage_bucket || !source.storage_key) {
      throw new Error("Source does not have a stored object reference.");
    }

    const object = (await this.getStorageClient().send(
      new GetObjectCommand({
        Bucket: source.storage_bucket,
        Key: source.storage_key
      })
    )) as any;

    if (!object.Body) {
      throw new Error("Source object body is empty.");
    }

    const bytes = await object.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  private async runPreprocessStage(batchId: string, actorId?: string | null) {
    const batch = await this.getBatchRow(batchId);
    await this.updateBatchStatus(batch.id, {
      status: REQUIREMENT_BATCH_STATUS.PROCESSING,
      processing_started_at: new Date().toISOString()
    });

    await this.logStage({
      batchId: batch.id,
      tenantId: batch.tenant_id,
      stage: "preprocess",
      status: "completed",
      workerName: "requirement-preprocess-worker",
      inputPayload: { actorId },
      outputPayload: { routed: true }
    });

    await this.enqueueOrRun(
      QUEUE_NAMES.requirementExtract,
      REQUIREMENT_EXTRACT_JOB,
      { batchId: batch.id },
      () => this.runExtractStage(batch.id)
    );
  }

  private async runExtractStage(batchId: string) {
    const batch = await this.getBatchRow(batchId);
    const sources = await this.getBatchSources(batchId);

    await this.clearBatchArtifacts(batchId);

    const extracted: ExtractedItemDraft[] = [];
    let ocrQueued = 0;

    for (const source of sources) {
      if (this.isOcrSource(source)) {
        ocrQueued += 1;
        await this.enqueueOrRun(
          QUEUE_NAMES.ocrExtraction,
          REQUIREMENT_OCR_JOB,
          { batchId: batch.id, sourceId: source.id },
          () => this.processOcrJob(batch.id, source.id)
        );
        continue;
      }

      if (source.source_type === REQUIREMENT_SOURCE_TYPE.PLAIN_TEXT && source.raw_text) {
        extracted.push(...this.parsePlainText(source.raw_text, source.id));
        continue;
      }

      if (source.source_type === REQUIREMENT_SOURCE_TYPE.CSV && source.raw_text) {
        extracted.push(...this.parseCsv(source.raw_text, source.id));
        continue;
      }

      if (source.raw_text && source.source_type === REQUIREMENT_SOURCE_TYPE.MIXED_NOTE) {
        extracted.push(...this.parsePlainText(source.raw_text, source.id));
        continue;
      }

      if (source.source_type === REQUIREMENT_SOURCE_TYPE.PDF) {
        try {
          const buffer = await this.fetchSourceBuffer(source);
          const pdfParse = require("pdf-parse");
          const pdfData = await pdfParse(buffer);
          const text = pdfData.text || "";
          if (text.trim()) {
            extracted.push(...this.parsePlainText(text, source.id));
            await this.supabaseAdmin
              .getClient()
              .from("requirement_batch_sources")
              .update({ raw_text: text })
              .eq("id", source.id);
            continue;
          }
        } catch (err: any) {
          this.logger.error(`Failed to parse PDF text: ${err.message}`);
        }
      }

      if (source.source_type === REQUIREMENT_SOURCE_TYPE.XLSX) {
        try {
          const buffer = await this.fetchSourceBuffer(source);
          const XLSX = require("xlsx");
          const workbook = XLSX.read(buffer, { type: "buffer" });
          let fullText = "";
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csvText = XLSX.utils.sheet_to_csv(sheet);
            fullText += csvText + "\n";
          }
          if (fullText.trim()) {
            extracted.push(...this.parseCsv(fullText, source.id));
            await this.supabaseAdmin
              .getClient()
              .from("requirement_batch_sources")
              .update({ raw_text: fullText })
              .eq("id", source.id);
            continue;
          }
        } catch (err: any) {
          this.logger.error(`Failed to parse Excel file: ${err.message}`);
        }
      }

      extracted.push(...this.createManualReviewPlaceholder(source));
    }

    const createdItems = await this.persistExtractedItems(batch, extracted);

    await this.logStage({
      batchId: batch.id,
      tenantId: batch.tenant_id,
      stage: "extract",
      status: "completed",
      workerName: "requirement-extract-worker",
      outputPayload: { itemCount: createdItems.length, ocrQueued }
    });

    if (createdItems.length > 0) {
      await this.enqueueOrRun(
        QUEUE_NAMES.requirementMatch,
        REQUIREMENT_MATCH_JOB,
        { batchId: batch.id },
        () => this.runMatchStage(batch.id)
      );
    }
  }

  private computeTokenScore(source: string, target: string) {
    const sourceTokens = new Set(tokenize(source));
    const targetTokens = tokenize(target);

    if (!sourceTokens.size || !targetTokens.length) {
      return 0;
    }

    let matches = 0;
    for (const token of targetTokens) {
      if (sourceTokens.has(token)) {
        matches += 1;
      }
    }

    return matches / Math.max(sourceTokens.size, targetTokens.length);
  }

  private async runMatchStage(batchId: string) {
    const batch = await this.getBatchRow(batchId);
    const items = await this.getBatchItems(batchId);

    if (!items.length) {
      return;
    }

    const itemIds = items.map((item: any) => item.id);
    const candidateDelete = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_item_candidates")
      .delete()
      .in("requirement_batch_item_id", itemIds);

    if (candidateDelete.error) {
      throw new Error(candidateDelete.error.message);
    }

    const productsResult = await this.supabaseAdmin
      .getReadClient()
      .from("products")
      .select("id, tenant_id, item_name, sku, unit, base_price, stock_status")
      .eq("tenant_id", batch.tenant_id)
      .eq("is_active", true);

    if (productsResult.error) {
      throw new Error(productsResult.error.message);
    }

    const products = productsResult.data ?? [];
    let approvedLikeCount = 0;
    let confidenceTotal = 0;

    for (const item of items) {
      const normalizedItem = item.normalized_text ?? normalizeText(item.raw_text);
      const ranked = products
        .map((product: any) => {
          const productText = `${product.item_name} ${product.sku ?? ""} ${product.unit ?? ""}`;
          const fuzzyScore = this.computeTokenScore(normalizedItem, productText);
          const semanticScore = fuzzyScore;
          const availabilityScore = product.stock_status === "in_stock" ? 1 : 0.45;
          const finalScore = Number(((fuzzyScore * 0.7) + (availabilityScore * 0.3)).toFixed(2));

          return {
            candidate_product_id: product.id,
            candidate_reason: fuzzyScore > 0.6 ? "token_overlap" : "low_confidence_similarity",
            semantic_score: semanticScore,
            fuzzy_score: fuzzyScore,
            brand_score: item.extracted_brand ? (normalizeText(productText).includes(item.extracted_brand.toLowerCase()) ? 1 : 0.25) : 0.5,
            availability_score: availabilityScore,
            final_score: finalScore,
            is_substitute: false
          };
        })
        .sort((a, b) => Number(b.final_score) - Number(a.final_score))
        .slice(0, 3);

      const best = ranked[0] ?? null;
      const matchConfidence = best?.final_score ?? 0;
      const reviewStatus =
        matchConfidence >= 0.86
          ? REQUIREMENT_REVIEW_STATUS.AUTO_MATCHED
          : REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW;

      await this.supabaseAdmin
        .getClient()
        .from("requirement_batch_items")
        .update({
          matched_product_id: best?.candidate_product_id ?? null,
          match_confidence: matchConfidence,
          review_status: reviewStatus,
          updated_at: new Date().toISOString()
        })
        .eq("id", item.id);

      if (ranked.length) {
        await this.supabaseAdmin.getClient().from("requirement_batch_item_candidates").insert(
          ranked.map((candidate) => ({
            requirement_batch_item_id: item.id,
            ...candidate
          }))
        );
      }

      confidenceTotal += matchConfidence;
      if (reviewStatus === REQUIREMENT_REVIEW_STATUS.AUTO_MATCHED) {
        approvedLikeCount += 1;
      }
    }

    const overallConfidence = items.length ? Number((confidenceTotal / items.length).toFixed(2)) : 0;
    const reviewStatus =
      items.length > 0 && approvedLikeCount === items.length
        ? REQUIREMENT_REVIEW_STATUS.AUTO_MATCHED
        : REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW;

    await this.updateBatchStatus(batch.id, {
      status: REQUIREMENT_BATCH_STATUS.AWAITING_REVIEW,
      review_status: reviewStatus,
      overall_confidence: overallConfidence,
      processing_completed_at: new Date().toISOString()
    });

    await this.logStage({
      batchId: batch.id,
      tenantId: batch.tenant_id,
      stage: "match",
      status: "completed",
      workerName: "requirement-match-worker",
      outputPayload: {
        itemCount: items.length,
        overallConfidence,
        reviewStatus
      }
    });

    await this.domainEvents.publish("requirement.review_required", {
      requirementBatchId: batch.id,
      tenantId: batch.tenant_id,
      reviewStatus,
      overallConfidence
    });
  }

  private async getBatchRow(batchId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }
    if (!result.data) {
      throw new BadRequestException("Requirement batch not found.");
    }
    return result.data as RequirementBatchRow;
  }

  private async getBatchSources(batchId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_sources")
      .select("*")
      .eq("requirement_batch_id", batchId)
      .order("created_at", { ascending: true });

    if (result.error) {
      throw new Error(result.error.message);
    }
    return (result.data ?? []) as RequirementBatchSourceRow[];
  }

  private async getBatchItems(batchId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .select("*")
      .eq("requirement_batch_id", batchId)
      .order("created_at", { ascending: true });

    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data ?? [];
  }

  private async maybeRunMatchStageAfterOcr(batchId: string) {
    const batch = await this.getBatchRow(batchId);
    const batchStatus = batch.status as RequirementBatchStatus;
    if (
      batchStatus !== REQUIREMENT_BATCH_STATUS.PROCESSING &&
      batchStatus !== REQUIREMENT_BATCH_STATUS.QUEUED
    ) {
      return false;
    }

    const sources = await this.getBatchSources(batchId);
    const ocrSources = sources.filter((source) => this.isOcrSource(source));

    if (!ocrSources.length) {
      await this.runMatchStage(batchId);
      return true;
    }

    const sourceIds = ocrSources.map((source) => source.id);
    const itemsResult = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .select("source_id")
      .eq("requirement_batch_id", batchId)
      .in("source_id", sourceIds);

    if (itemsResult.error) {
      throw new Error(itemsResult.error.message);
    }

    const completedSourceIds = new Set(
      (itemsResult.data ?? [])
        .map((item: { source_id: string | null }) => item.source_id)
        .filter((sourceId): sourceId is string => Boolean(sourceId))
    );

    if (sourceIds.some((sourceId) => !completedSourceIds.has(sourceId))) {
      return false;
    }

    await this.runMatchStage(batchId);
    return true;
  }

  async createTextBatch(actor: RequestActor, body: CreateRequirementTextBatchRequestDto) {
    const tenantId = await this.requireTenant(actor);
    const batch = await this.insertBatch({
      tenantId,
      createdBy: actor.appUserId!,
      siteId: body.site_id ?? null,
      sourceChannel: body.source_channel ?? "typed_text",
      inputLanguage: body.input_language ?? null,
      notes: body.raw_text.slice(0, 2000)
    });

    await this.insertSource({
      batchId: batch.id,
      tenantId,
      sourceType: REQUIREMENT_SOURCE_TYPE.PLAIN_TEXT,
      mimeType: "text/plain",
      originalFilename: null,
      rawText: body.raw_text,
      metadata: {
        sourceChannel: body.source_channel ?? "typed_text"
      }
    });

    await this.domainEvents.publish("requirement.batch_created", {
      requirementBatchId: batch.id,
      tenantId,
      sourceType: REQUIREMENT_SOURCE_TYPE.PLAIN_TEXT
    });

    // Fire pipeline in background — don't block the HTTP response
    this.fireAndForgetPipeline(batch.id, actor.appUserId);

    return batch;
  }

  async createUploadBatch(
    actor: RequestActor,
    file: UploadedRequirementFile,
    meta: { site_id?: string | null; source_channel?: string | null; input_language?: string | null }
  ) {
    const tenantId = await this.requireTenant(actor);

    if (!file) {
      throw new BadRequestException("Requirement file is required.");
    }

    const batch = await this.insertBatch({
      tenantId,
      createdBy: actor.appUserId!,
      siteId: meta.site_id ?? null,
      sourceChannel: meta.source_channel ?? "file_upload",
      inputLanguage: meta.input_language ?? null,
      notes: file.originalname
    });

    const sourceType = inferSourceType(file.originalname, file.mimetype);
    const bucket = this.getStorageBucket();
    const objectKey = `requirements/${tenantId}/${batch.id}/original/${Date.now()}-${randomUUID()}-${sanitizeFilename(file.originalname || "requirement")}`;

    const storageClient = this.getStorageClient();
    await storageClient.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream"
      })
    );

    const maybeText =
      sourceType === REQUIREMENT_SOURCE_TYPE.CSV ||
      file.mimetype.startsWith("text/")
        ? file.buffer.toString("utf8")
        : null;

    await this.insertSource({
      batchId: batch.id,
      tenantId,
      sourceType,
      mimeType: file.mimetype,
      originalFilename: file.originalname,
      storageBucket: bucket,
      storageKey: objectKey,
      publicUrl: this.getPublicBaseUrl() ? `${this.getPublicBaseUrl()}/${objectKey}` : null,
      rawText: maybeText,
      metadata: {
        size: file.size,
        sourceChannel: meta.source_channel ?? "file_upload"
      }
    });

    await this.domainEvents.publish("requirement.source_uploaded", {
      requirementBatchId: batch.id,
      tenantId,
      sourceType,
      filename: file.originalname
    });

    // Fire pipeline in background — don't block the HTTP response
    this.fireAndForgetPipeline(batch.id, actor.appUserId);

    return batch;
  }

  async listBatches(actor: RequestActor) {
    const tenantId = await this.requireTenant(actor);
    let query = this.supabaseAdmin
      .getReadClient()
      .from("requirement_batches")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (actor.role !== "admin") {
      query = query.eq("created_by", actor.appUserId);
    }

    const result = await query;
    if (result.error) {
      if (isMissingRequirementSchemaError(result.error.message)) {
        throw new BadRequestException(
          "Requirement ingestion tables are not deployed yet. Apply db/requirement_ingestion_foundation.sql to this environment."
        );
      }
      throw new Error(result.error.message);
    }
    return result.data ?? [];
  }

  async getBatch(actor: RequestActor, batchId: string) {
    const batch = await this.getBatchRow(batchId);
    await this.tenantAccess.assertTenantAccess(actor, batch.tenant_id);

    if (actor.role !== "admin" && batch.created_by !== actor.appUserId) {
      throw new ForbiddenException("You can only view your own requirement batches.");
    }

    const [sources, items, candidates] = await Promise.all([
      this.getBatchSources(batchId),
      this.getBatchItems(batchId),
      this.supabaseAdmin
        .getClient()
        .from("requirement_batch_item_candidates")
        .select("*")
        .in(
          "requirement_batch_item_id",
          (await this.getBatchItems(batchId)).map((item: any) => item.id)
        )
    ]);

    const candidateMap = new Map<string, any[]>();
    for (const candidate of candidates.data ?? []) {
      const list = candidateMap.get(candidate.requirement_batch_item_id) ?? [];
      list.push(candidate);
      candidateMap.set(candidate.requirement_batch_item_id, list);
    }

    return {
      ...batch,
      sources,
      items: items.map((item: any) => ({
        ...item,
        candidates: candidateMap.get(item.id) ?? []
      }))
    };
  }

  async updateBatch(
    actor: RequestActor,
    batchId: string,
    body: { site_id?: string | null }
  ) {
    const batch = await this.getBatchRow(batchId);
    await this.tenantAccess.assertTenantAccess(actor, batch.tenant_id);

    // Allow the batch creator OR admin/architect to update it
    if (actor.role !== "admin" && actor.role !== "architect" && batch.created_by !== actor.appUserId) {
      throw new ForbiddenException("Only the batch creator or an admin can update this batch.");
    }

    await this.updateBatchStatus(batchId, {
      site_id: body.site_id ?? null
    });

    return this.getBatch(actor, batchId);
  }

  async deleteBatch(actor: RequestActor, batchId: string) {
    const batch = await this.getBatchRow(batchId);
    await this.tenantAccess.assertTenantAccess(actor, batch.tenant_id);

    if (actor.role !== "admin" && actor.role !== "customer" && batch.created_by !== actor.appUserId) {
      throw new ForbiddenException("Only administrators, customers, or the batch creator can delete requirement batches.");
    }

    // 1. Fetch all sources for this batch to delete their files from S3/R2
    const sourcesResult = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_sources")
      .select("storage_bucket, storage_key")
      .eq("requirement_batch_id", batchId);

    if (sourcesResult.data && sourcesResult.data.length > 0) {
      const storageClient = this.getStorageClient();
      for (const source of sourcesResult.data) {
        if (source.storage_bucket && source.storage_key) {
          try {
            await storageClient.send(
              new DeleteObjectCommand({
                Bucket: source.storage_bucket,
                Key: source.storage_key
              })
            );
            this.logger.log(`Successfully deleted S3 object: ${source.storage_key}`);
          } catch (err: any) {
            this.logger.error(
              `Failed to delete S3 object ${source.storage_key}: ${err?.message ?? String(err)}`
            );
            // Don't block the database cleanup if S3 delete fails
          }
        }
      }
    }

    // 2. Delete candidates and items
    await this.clearBatchArtifacts(batchId);

    // 3. Delete sources from Supabase
    const sourcesDelete = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_sources")
      .delete()
      .eq("requirement_batch_id", batchId);
    
    if (sourcesDelete.error) {
      throw new Error(sourcesDelete.error.message);
    }

    // 4. Delete the batch itself from Supabase
    const batchDelete = await this.supabaseAdmin
      .getClient()
      .from("requirement_batches")
      .delete()
      .eq("id", batchId);

    if (batchDelete.error) {
      throw new Error(batchDelete.error.message);
    }
  }

  async reviewItem(
    actor: RequestActor,
    batchId: string,
    itemId: string,
    body: ReviewRequirementBatchItemRequestDto
  ) {
    const batch = await this.getBatchRow(batchId);
    await this.assertReviewAccess(actor, batch.tenant_id);

    const itemResult = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .select("*")
      .eq("id", itemId)
      .eq("requirement_batch_id", batchId)
      .maybeSingle();

    if (itemResult.error) {
      throw new Error(itemResult.error.message);
    }
    if (!itemResult.data) {
      throw new BadRequestException("Requirement batch item not found.");
    }

    const updatePayload = {
      review_status: body.review_status,
      normalized_text: body.normalized_text ?? itemResult.data.normalized_text,
      extracted_quantity: body.extracted_quantity ?? itemResult.data.extracted_quantity,
      extracted_unit: body.extracted_unit ?? itemResult.data.extracted_unit,
      extracted_brand: body.extracted_brand ?? itemResult.data.extracted_brand,
      extracted_specifications:
        body.extracted_specifications ?? itemResult.data.extracted_specifications,
      extracted_dimensions: body.extracted_dimensions ?? itemResult.data.extracted_dimensions,
      extracted_category: body.extracted_category ?? itemResult.data.extracted_category,
      matched_product_id: body.matched_product_id ?? itemResult.data.matched_product_id,
      review_notes: body.review_notes ?? itemResult.data.review_notes,
      updated_at: new Date().toISOString()
    };

    const updateResult = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .update(updatePayload)
      .eq("id", itemId)
      .select("*")
      .single();

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }

    await this.supabaseAdmin.getClient().from("requirement_batch_review_actions").insert({
      requirement_batch_id: batchId,
      item_id: itemId,
      reviewed_by: actor.appUserId,
      action_type: "item_review_updated",
      old_value: itemResult.data,
      new_value: updateResult.data,
      notes: body.review_notes ?? null
    });

    await this.domainEvents.publish("requirement.review_updated", {
      requirementBatchId: batchId,
      itemId,
      tenantId: batch.tenant_id,
      reviewStatus: body.review_status
    });

    return updateResult.data;
  }

  async generateProcurement(
    actor: RequestActor,
    batchId: string,
    _body: GenerateRequirementProcurementRequestDto
  ) {
    const batch = await this.getBatchRow(batchId);
    await this.assertReviewAccess(actor, batch.tenant_id);

    if (!batch.site_id) {
      throw new BadRequestException("A site must be attached before procurement can be generated.");
    }

    if (batch.generated_site_order_id) {
      return {
        batchId,
        siteOrderId: batch.generated_site_order_id,
        createdOrderItems: 0,
        createdProductRequests: 0
      };
    }

    const siteResult = await this.supabaseAdmin
      .getClient()
      .from("sites")
      .select("id, customer_id, approval_mode")
      .eq("id", batch.site_id)
      .maybeSingle();

    if (siteResult.error) {
      throw new Error(siteResult.error.message);
    }
    if (!siteResult.data) {
      throw new BadRequestException("Site not found.");
    }

    const items = (await this.getBatchItems(batchId)).filter(
      (item: any) =>
        ["approved", "auto_matched"].includes(item.review_status) ||
        (item.matched_product_id && item.review_status !== "rejected")
    );

    if (!items.length) {
      throw new BadRequestException("No approved requirement items are ready for procurement.");
    }

    const orderNumber = `REQ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")}`;

    const orderResult = await this.supabaseAdmin
      .getClient()
      .from("site_orders")
      .insert({
        tenant_id: batch.tenant_id,
        site_id: batch.site_id,
        order_number: orderNumber,
        customer_id: siteResult.data.customer_id,
        status: "draft",
        subtotal_amount: 0,
        tax_amount: 0,
        total_amount: 0,
        created_by: actor.appUserId
      })
      .select("id")
      .single();

    if (orderResult.error) {
      throw new Error(orderResult.error.message);
    }

    let totalAmount = 0;
    let createdOrderItems = 0;
    let createdProductRequests = 0;

    for (const item of items) {
      if (item.matched_product_id) {
        const productResult = await this.supabaseAdmin
          .getClient()
          .from("products")
          .select("id, item_name, sku, unit, base_price, category_id, brand_id")
          .eq("id", item.matched_product_id)
          .maybeSingle();

        if (productResult.error || !productResult.data) {
          continue;
        }

        const quantity = Number(item.extracted_quantity ?? 1);
        const unitPrice = Number(productResult.data.base_price ?? 0);
        const lineTotal = Number((quantity * unitPrice).toFixed(2));
        totalAmount += lineTotal;

        const insertOrderItem = await this.supabaseAdmin.getClient().from("order_items").insert({
          tenant_id: batch.tenant_id,
          site_order_id: orderResult.data.id,
          site_id: batch.site_id,
          product_id: productResult.data.id,
          source: "admin",
          source_user_id: actor.appUserId,
          approval_mode: siteResult.data.approval_mode ?? "architect_then_customer",
          requires_architect_approval: true,
          item_name_snapshot: productResult.data.item_name,
          category_name_snapshot: item.extracted_category ?? null,
          brand_name_snapshot: item.extracted_brand ?? null,
          sku_snapshot: productResult.data.sku ?? null,
          unit_snapshot: item.extracted_unit ?? productResult.data.unit,
          quantity_required: quantity,
          unit_price: unitPrice,
          line_subtotal: lineTotal,
          tax_amount: 0,
          line_total: lineTotal,
          admin_notes: `Generated from requirement batch ${batchId}`,
          status: "draft"
        });

        if (!insertOrderItem.error) {
          createdOrderItems += 1;
        }
      } else {
        const requestResult = await this.supabaseAdmin.getClient().from("product_requests").insert({
          tenant_id: batch.tenant_id,
          site_id: batch.site_id,
          requested_by_user_id: actor.appUserId,
          title: item.normalized_text ?? item.raw_text,
          preferred_category: item.extracted_category,
          preferred_brand: item.extracted_brand,
          description: item.raw_text,
          status: "submitted",
          admin_notes: `Generated from requirement batch ${batchId}`
        });

        if (!requestResult.error) {
          createdProductRequests += 1;
        }
      }
    }

    await this.supabaseAdmin
      .getClient()
      .from("site_orders")
      .update({
        subtotal_amount: totalAmount,
        total_amount: totalAmount
      })
      .eq("id", orderResult.data.id);

    await this.updateBatchStatus(batchId, {
      status: REQUIREMENT_BATCH_STATUS.GENERATED,
      review_status: REQUIREMENT_REVIEW_STATUS.APPROVED,
      approved_at: new Date().toISOString(),
      approved_by: actor.appUserId,
      generated_site_order_id: orderResult.data.id
    });

    await this.domainEvents.publish("requirement.procurement_generated", {
      requirementBatchId: batchId,
      tenantId: batch.tenant_id,
      siteOrderId: orderResult.data.id,
      createdOrderItems,
      createdProductRequests
    });

    return {
      batchId,
      siteOrderId: orderResult.data.id,
      createdOrderItems,
      createdProductRequests
    };
  }

  async processPreprocessJob(batchId: string) {
    await this.runPreprocessStage(batchId);
  }

  async processExtractJob(batchId: string) {
    await this.runExtractStage(batchId);
  }

  async processMatchJob(batchId: string) {
    await this.runMatchStage(batchId);
  }

  async processOcrJob(batchId: string, sourceId: string) {
    try {
      await this.requirementOcrService.processOcrPayload({ batchId, sourceId });
    } catch (err: any) {
      this.logger.error(`OCR failed for batch ${batchId}, source ${sourceId}: ${err?.message ?? String(err)}`);
      // Insert a placeholder item so the batch can still progress to review
      try {
        const batch = await this.getBatchRow(batchId);
        const sources = await this.getBatchSources(batchId);
        const source = sources.find((s) => s.id === sourceId);
        if (source) {
          await this.persistExtractedItems(batch, [
            {
              sourceId: source.id,
              rawText: `OCR failed for file: ${source.original_filename ?? "uploaded image"}. Please review manually.`,
              normalizedText: null,
              extractedQuantity: null,
              extractedUnit: null,
              extractedBrand: null,
              extractedSpecifications: null,
              extractedDimensions: null,
              extractedCategory: null,
              extractionConfidence: 0.1,
              reviewStatus: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
            }
          ]);
        }
      } catch (_e) {
        // best-effort placeholder insertion
      }
    }
    try {
      await this.maybeRunMatchStageAfterOcr(batchId);
    } catch (matchErr: any) {
      this.logger.error(`Match stage failed after OCR for batch ${batchId}: ${matchErr?.message ?? String(matchErr)}`);
    }
  }
}
