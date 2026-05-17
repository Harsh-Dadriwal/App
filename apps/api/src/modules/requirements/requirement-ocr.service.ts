import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable, Logger } from "@nestjs/common";
import {
  REQUIREMENT_REVIEW_STATUS,
  REQUIREMENT_SOURCE_TYPE,
  type RequirementReviewStatus
} from "@mahalaxmi/core/types/domain";
import { SupabaseAdminService } from "../../common/supabase/supabase-admin.service";
import { ImagePreprocessorService } from "./image-preprocessor.service";

type OcrQueuePayload = {
  batchId: string;
  sourceId: string;
};

type RequirementBatchRow = {
  id: string;
  tenant_id: string;
};

type RequirementBatchSourceRow = {
  id: string;
  requirement_batch_id: string;
  tenant_id: string;
  source_type: string;
  mime_type: string | null;
  original_filename: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  raw_text: string | null;
  metadata_json: Record<string, unknown> | null;
};

type OcrWord = {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

type OcrLine = {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  words?: OcrWord[];
};

type TesseractResult = {
  data?: {
    text?: string;
    confidence?: number;
    lines?: OcrLine[];
    words?: OcrWord[];
  };
};

type ExtractedOcrItem = {
  raw_text: string;
  normalized_text: string;
  extracted_quantity: number | null;
  extracted_unit: string | null;
  extracted_brand: string | null;
  extracted_specifications: string | null;
  extracted_dimensions: string | null;
  extracted_category: string | null;
  extraction_confidence: number;
  review_status: RequirementReviewStatus;
  review_notes: string | null;
  source_coordinates: Record<string, unknown>;
  source_line_number: number;
};

const LOW_CONFIDENCE_THRESHOLD = 60;
const KNOWN_BRANDS = ["havells", "anchor", "polycab", "finolex", "legrand", "schneider"];
const OCR_NOISE_PATTERNS = [
  /^\d{1,2}:\d{2}(?:\s?[AP]M)?$/i,
  /^\d{1,2}:\d{2}\s?(?:am|pm)$/i,
  /^\d{1,3}%$/,
  /^(airtel|jio|vi|vodafone|idea)$/i,
  /^(4g|5g|lte|volte|wifi)$/i,
  /^[\d.]+(?:kb|mb|gb)\/s$/i,
  /^(today|yesterday)$/i,
  /^[\d\s:]+$/,
  /^[▲△▼▽•\-\s]+$/
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[|,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const normalized = normalizeText(line);
  return KNOWN_BRANDS.find((brand) => normalized.includes(brand)) ?? null;
}

function detectCategory(line: string) {
  const normalized = normalizeText(line);
  if (normalized.includes("wire") || normalized.includes("cable")) return "wiring";
  if (normalized.includes("switch") || normalized.includes("socket")) return "switches";
  if (normalized.includes("pipe") || normalized.includes("conduit")) return "conduit";
  if (normalized.includes("light") || normalized.includes("lamp")) return "lighting";
  if (normalized.includes("board") || normalized.includes("db")) return "distribution";
  return null;
}

function detectDimensions(line: string) {
  const match = line.match(/\b\d+(?:\.\d+)?\s?(?:mm|sqmm|sq|inch|in|ft)\b/gi);
  return match?.join(", ") ?? null;
}

function isLikelyNoise(text: string) {
  const compact = text.trim();
  if (!compact) return true;
  return OCR_NOISE_PATTERNS.some((pattern) => pattern.test(compact));
}

function toPercent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function toBoundingBoxPercentages(
  bbox: { x0: number; y0: number; x1: number; y1: number } | undefined,
  width: number,
  height: number
) {
  if (!bbox) {
    return {
      x: 0,
      y: 0,
      w: 0,
      h: 0
    };
  }

  return {
    x: toPercent(bbox.x0, width),
    y: toPercent(bbox.y0, height),
    w: toPercent(Math.max(0, bbox.x1 - bbox.x0), width),
    h: toPercent(Math.max(0, bbox.y1 - bbox.y0), height)
  };
}

async function dynamicImportTesseract(): Promise<any> {
  const importer = new Function("moduleName", "return import(moduleName);") as (
    moduleName: string
  ) => Promise<any>;
  return importer("tesseract.js");
}

@Injectable()
export class RequirementOcrService {
  private readonly logger = new Logger(RequirementOcrService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly imagePreprocessor: ImagePreprocessorService
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

  private async fetchBatch(batchId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batches")
      .select("id, tenant_id")
      .eq("id", batchId)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }
    if (!result.data) {
      throw new Error("Requirement batch not found for OCR.");
    }
    return result.data as RequirementBatchRow;
  }

  private async fetchSource(sourceId: string, batchId: string) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_sources")
      .select("*")
      .eq("id", sourceId)
      .eq("requirement_batch_id", batchId)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }
    if (!result.data) {
      throw new Error("Requirement source not found for OCR.");
    }
    return result.data as RequirementBatchSourceRow;
  }

  private async fetchObjectBuffer(source: RequirementBatchSourceRow) {
    if (!source.storage_bucket || !source.storage_key) {
      throw new Error("OCR source does not have a stored object reference.");
    }

    const object = await this.getStorageClient().send(
      new GetObjectCommand({
        Bucket: source.storage_bucket,
        Key: source.storage_key
      })
    );

    if (!object.Body) {
      throw new Error("OCR source object body is empty.");
    }

    const bytes = await object.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  private async loadTesseractWorker() {
    const { createWorker } = await dynamicImportTesseract();
    const worker = await createWorker(["eng", "hin"]);
    await worker.setParameters({
      tessedit_pageseg_mode: "6"
    });
    return worker;
  }

  private cleanText(text: string) {
    return text
      .replace(/\u200b/g, " ")
      .replace(/[^\S\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private filterAndStructureLines(
    result: TesseractResult,
    width: number,
    height: number
  ): { items: ExtractedOcrItem[]; cleanedRawText: string; averageConfidence: number } {
    const lines = result.data?.lines ?? [];
    const items: ExtractedOcrItem[] = [];
    const rawSegments: string[] = [];
    let confidenceSum = 0;
    let confidenceCount = 0;

    for (const [index, line] of lines.entries()) {
      const cleanedText = this.cleanText(line.text ?? "");
      if (!cleanedText || isLikelyNoise(cleanedText)) {
        continue;
      }

      const lineConfidence = Number(line.confidence ?? 0);
      confidenceSum += lineConfidence;
      confidenceCount += 1;
      rawSegments.push(cleanedText);

      const { quantity, unit } = parseQuantityAndUnit(cleanedText);
      const lowConfidence = lineConfidence < LOW_CONFIDENCE_THRESHOLD;
      const words = (line.words ?? [])
        .map((word) => {
          const wordText = this.cleanText(word.text ?? "");
          if (!wordText || isLikelyNoise(wordText)) {
            return null;
          }

          return {
            text: wordText,
            confidence: Number(word.confidence ?? 0),
            bbox: toBoundingBoxPercentages(word.bbox, width, height)
          };
        })
        .filter(Boolean);

      items.push({
        raw_text: cleanedText,
        normalized_text: normalizeText(cleanedText),
        extracted_quantity: quantity,
        extracted_unit: unit,
        extracted_brand: detectBrand(cleanedText),
        extracted_specifications: null,
        extracted_dimensions: detectDimensions(cleanedText),
        extracted_category: detectCategory(cleanedText),
        extraction_confidence: Number((lineConfidence / 100).toFixed(2)),
        review_status: lowConfidence
          ? REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
          : REQUIREMENT_REVIEW_STATUS.PENDING,
        review_notes: lowConfidence ? "low_ocr_confidence" : null,
        source_line_number: index + 1,
        source_coordinates: {
          page: 1,
          bbox: toBoundingBoxPercentages(line.bbox, width, height),
          words,
          line_confidence: lineConfidence
        }
      });
    }

    const averageConfidence = confidenceCount
      ? Number((confidenceSum / confidenceCount).toFixed(2))
      : 0;

    if (!items.length) {
      items.push({
        raw_text: "OCR could not confidently extract readable lines from this source.",
        normalized_text: "ocr could not confidently extract readable lines from this source",
        extracted_quantity: null,
        extracted_unit: null,
        extracted_brand: null,
        extracted_specifications: null,
        extracted_dimensions: null,
        extracted_category: null,
        extraction_confidence: 0.15,
        review_status: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW,
        review_notes: "low_ocr_confidence",
        source_line_number: 1,
        source_coordinates: {
          page: 1,
          bbox: { x: 0, y: 0, w: 100, h: 100 },
          words: []
        }
      });
    }

    return {
      items,
      cleanedRawText: rawSegments.join("\n"),
      averageConfidence
    };
  }

  private async clearSourceArtifacts(sourceId: string) {
    const itemResult = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .select("id")
      .eq("source_id", sourceId);

    if (itemResult.error) {
      throw new Error(itemResult.error.message);
    }

    const itemIds = (itemResult.data ?? []).map((item: { id: string }) => item.id);
    if (itemIds.length) {
      const candidateDelete = await this.supabaseAdmin
        .getClient()
        .from("requirement_batch_item_candidates")
        .delete()
        .in("requirement_batch_item_id", itemIds);

      if (candidateDelete.error) {
        throw new Error(candidateDelete.error.message);
      }
    }

    const itemDelete = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .delete()
      .eq("source_id", sourceId);

    if (itemDelete.error) {
      throw new Error(itemDelete.error.message);
    }
  }

  private async persistExtractedItems(batch: RequirementBatchRow, sourceId: string, items: ExtractedOcrItem[]) {
    const result = await this.supabaseAdmin
      .getClient()
      .from("requirement_batch_items")
      .insert(
        items.map((item) => ({
          requirement_batch_id: batch.id,
          tenant_id: batch.tenant_id,
          source_id: sourceId,
          source_page: 1,
          source_line_number: item.source_line_number,
          raw_text: item.raw_text,
          normalized_text: item.normalized_text,
          extracted_quantity: item.extracted_quantity,
          extracted_unit: item.extracted_unit,
          extracted_brand: item.extracted_brand,
          extracted_specifications: item.extracted_specifications,
          extracted_dimensions: item.extracted_dimensions,
          extracted_category: item.extracted_category,
          extraction_confidence: item.extraction_confidence,
          review_status: item.review_status,
          review_notes: item.review_notes,
          source_coordinates: item.source_coordinates
        }))
      )
      .select("id");

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data ?? [];
  }

  async processOcrPayload(payload: OcrQueuePayload) {
    const batch = await this.fetchBatch(payload.batchId);
    const source = await this.fetchSource(payload.sourceId, payload.batchId);

    if (
      ![
        REQUIREMENT_SOURCE_TYPE.IMAGE,
        REQUIREMENT_SOURCE_TYPE.HANDWRITTEN_IMAGE,
        REQUIREMENT_SOURCE_TYPE.WHATSAPP_SCREENSHOT
      ].includes(source.source_type as any)
    ) {
      return { batchId: payload.batchId, sourceId: payload.sourceId, skipped: true };
    }

    const rawBuffer = await this.fetchObjectBuffer(source);
    const preprocessed = await this.imagePreprocessor.preprocessForTesseract(rawBuffer);
    const worker = await this.loadTesseractWorker();

    try {
      const result = (await worker.recognize(preprocessed.buffer)) as TesseractResult;
      const structured = this.filterAndStructureLines(result, preprocessed.width, preprocessed.height);
      const lowConfidence = structured.averageConfidence < LOW_CONFIDENCE_THRESHOLD;

      await this.clearSourceArtifacts(source.id);
      const savedItems = await this.persistExtractedItems(batch, source.id, structured.items.map((item) => ({
        ...item,
        review_status:
          lowConfidence && item.review_status !== REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
            ? REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
            : item.review_status,
        review_notes:
          lowConfidence && !item.review_notes
            ? "low_ocr_confidence"
            : item.review_notes
      })));

      const sourceUpdate = await this.supabaseAdmin
        .getClient()
        .from("requirement_batch_sources")
        .update({
          raw_text: structured.cleanedRawText,
          metadata_json: {
            ...(source.metadata_json ?? {}),
            ocr: {
              average_confidence: structured.averageConfidence,
              density: preprocessed.density,
              width: preprocessed.width,
              height: preprocessed.height,
              flags: lowConfidence ? ["low_ocr_confidence"] : [],
              line_count: structured.items.length
            }
          }
        })
        .eq("id", source.id);

      if (sourceUpdate.error) {
        throw new Error(sourceUpdate.error.message);
      }

      await this.supabaseAdmin.getClient().from("requirement_batch_processing_jobs").insert({
        requirement_batch_id: batch.id,
        tenant_id: batch.tenant_id,
        stage: "ocr",
        status: "completed",
        worker_name: "tesseract-ocr-worker",
        input_payload: {
          sourceId: source.id,
          filename: source.original_filename
        },
        output_payload: {
          itemCount: savedItems.length,
          averageConfidence: structured.averageConfidence,
          lowConfidence
        },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });

      return {
        batchId: batch.id,
        sourceId: source.id,
        itemCount: savedItems.length,
        averageConfidence: structured.averageConfidence,
        lowConfidence
      };
    } catch (error) {
      this.logger.error(
        `OCR failed for batch ${payload.batchId}, source ${payload.sourceId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`
      );

      await this.supabaseAdmin.getClient().from("requirement_batch_processing_jobs").insert({
        requirement_batch_id: batch.id,
        tenant_id: batch.tenant_id,
        stage: "ocr",
        status: "failed",
        worker_name: "tesseract-ocr-worker",
        input_payload: {
          sourceId: source.id,
          filename: source.original_filename
        },
        error_message: error instanceof Error ? error.message : "Unknown OCR failure",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });

      throw error;
    } finally {
      await worker.terminate();
    }
  }
}
