import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable, Logger } from "@nestjs/common";
import { existsSync } from "fs";
import { join } from "path";
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
    blocks?: any[];
  };
};

type ExtractedOcrItem = {
  raw_text: string;
  normalized_text: string | null;
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

type VariantRecognition = {
  variantName: string;
  structured: {
    items: ExtractedOcrItem[];
    cleanedRawText: string;
    averageConfidence: number;
    acceptedLineCount: number;
    rejectedLineCount: number;
  };
  score: number;
};

const LOW_CONFIDENCE_THRESHOLD = 60;
const LINE_CONFIDENCE_THRESHOLD = 35;

const KNOWN_BRANDS = [
  // English brand names
  "havells", "anchor", "polycab", "finolex", "legrand", "schneider",
  "crompton", "bajaj", "phillips", "philips", "syska", "wipro",
  "surya", "orient", "l&t", "cg", "siemens", "abb", "rr", "gm",
  // Transliterated / Hindi brand mentions
  "suvidha", "orbit", "texmo", "khaitan"
];

// Hindi unit words (Devanagari + transliterated)
const HINDI_UNITS: Record<string, string> = {
  "\u0928\u0917": "nos",    // नग
  "\u0928\u0917\u0902": "nos",  // नगं  
  "\u0928\u0902\u0917": "nos",
  "\u092c\u0902\u0921\u0932": "bundle", // बंडल
  "\u092c\u0902\u0921\u0932\u0938": "bundle",
  "\u092b\u093c\u0940\u091f": "ft",   // फ़ीट
  "\u092b\u093f\u091f": "ft",
  "\u092b\u0940\u091f": "ft",
  "\u0915\u093f\u0932\u094b": "kg",   // किलो
  "\u0930\u094b\u0932": "roll",       // रोल
  "\u092a\u0940\u0938": "pcs",        // पीस
  "\u0938\u0947\u091f": "set",        // सेट
  "nos": "nos", "no": "nos"
};

const OCR_NOISE_PATTERNS = [
  /^\d{1,2}:\d{2}(?:\s?[AP]M)?$/i,        // timestamps like 10:30 AM
  /^\d{1,2}:\d{2}\s?(?:am|pm)$/i,
  /^\d{1,3}%$/,                             // percentages
  /^(airtel|jio|vi|vodafone|idea)$/i,       // carrier names
  /^(4g|5g|lte|volte|wifi)$/i,
  /^[\d.]+(?:kb|mb|gb)\/s$/i,
  /^(today|yesterday)$/i,
  /^[\u2580-\u259f\u25a0-\u25ff\u2600-\u26ff\u2700-\u27bf▲△▼▽•\-\s]+$/  // only symbols
  // NOTE: Removed the /^[\d\s:]+$/ pattern — it was incorrectly
  // filtering out numbered list lines like "14)" before stripping
];

/** Strip numbered-list prefixes like "14)", "15.", "(16)" from the start of a line */
function stripListPrefix(text: string): string {
  return text.replace(/^[\s]*(?:\d{1,3}[.)\]:\s]+)/, "").trim();
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[|,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRequirementText(value: string) {
  return normalizeText(value)
    .replace(/\b(\d+(?:\.\d+)?)\s*(sq\.?\s*mm|sqmm|sq|mm2)\b/gi, "$1 sqmm")
    .replace(/\b(\d+(?:\.\d+)?)\s*(wire|cable)\b/gi, (_, gauge, noun) => {
      const size = Number(gauge);
      if (Number.isFinite(size) && size > 0 && size <= 25) {
        return `${gauge} sqmm ${noun}`;
      }
      return `${gauge} ${noun}`;
    })
    .replace(/\bfeet\b/gi, "ft")
    .replace(/\bnos?\b/gi, "nos")
    .replace(/\bbundles?\b/gi, "bundle")
    .replace(/\bboxes?\b/gi, "box")
    .replace(/\bsets?\b/gi, "set");
}

function parseQuantityAndUnit(line: string) {
  // Match quantity patterns: "4 नग", "2 bundle", "60 ft", "1.5mm"
  const quantityMatch = line.match(/(\d+(?:\.\d+)?)/);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : null;

  // English units
  const engUnitMatch = line.match(
    /\b(pcs|pc|box|boxes|set|sets|pair|pairs|m|mm|sqmm|sq\.?mm|kg|ltr|litre|roll|rolls|bundle|bundles|nos?|ft|feet|inch|in|length)\b/i
  );

  // Hindi units (look for Devanagari unit words)
  let hindiUnit: string | null = null;
  for (const [hindi, eng] of Object.entries(HINDI_UNITS)) {
    if (line.includes(hindi)) {
      hindiUnit = eng;
      break;
    }
  }

  const unit = engUnitMatch ? engUnitMatch[1].toLowerCase() : hindiUnit;
  return { quantity, unit };
}

function detectBrand(line: string) {
  const normalized = normalizeText(line);
  return KNOWN_BRANDS.find((brand) => normalized.includes(brand)) ?? null;
}

function detectCategory(line: string) {
  const normalized = normalizeText(line);
  const lower = line.toLowerCase();

  // English keywords
  if (normalized.includes("wire") || normalized.includes("cable") ||
      normalized.includes("केवल") || normalized.includes("\u0915\u0947\u0935\u0932")) return "wiring";
  if (normalized.includes("switch") || normalized.includes("socket") ||
      normalized.includes("\u0938\u094d\u0935\u093f\u091a")) return "switches";
  if (normalized.includes("pipe") || normalized.includes("conduit") ||
      normalized.includes("\u092a\u093e\u0907\u092a")) return "conduit";
  if (normalized.includes("light") || normalized.includes("lamp") ||
      normalized.includes("\u0932\u093e\u0907\u091f")) return "lighting";
  if (normalized.includes("board") || normalized.includes(" db ") ||
      normalized.includes("\u092c\u094b\u0930\u094d\u0921")) return "distribution";
  if (normalized.includes("screw") || normalized.includes("nut") ||
      normalized.includes("bolt") || normalized.includes("\u0938\u094d\u0915\u094d\u0930\u0942")) return "hardware";
  if (normalized.includes("knife") || normalized.includes("\u091b\u0941\u0930\u0940") ||
      lower.includes("\u091a\u093e\u0915\u0942")) return "tools";
  return null;
}

function detectDimensions(line: string) {
  const match = line.match(/\b\d+(?:\.\d+)?\s?(?:mm|sqmm|sq\.?mm|inch|in|ft|feet|\"|\'|\u0022)\b/gi);
  return match?.join(", ") ?? null;
}

function isLikelyNoise(text: string) {
  const compact = text.trim();
  if (!compact) return true;
  // Minimum length check — skip single characters unless they're Hindi
  if (compact.length < 2 && !/[\u0900-\u097F]/.test(compact)) return true;
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

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms);
    });
    try {
      const result = await Promise.race([promise, timeout]);
      clearTimeout(timer!);
      return result;
    } catch (err) {
      clearTimeout(timer!);
      throw err;
    }
  }

  private async loadTesseractWorker(): Promise<any> {
    const { createWorker } = await dynamicImportTesseract();
    const localLangPath = this.resolveTessdataPath();
    const workerOptions = localLangPath
      ? {
          langPath: localLangPath,
          cachePath: localLangPath
        }
      : undefined;
    // 90 second timeout for worker creation (includes language data download)
    const worker: any = await this.withTimeout(
      createWorker(["eng", "hin"], 1, workerOptions) as Promise<any>,
      90_000,
      "createWorker"
    );
    await worker.setParameters({
      // PSM 6: Assume a single uniform block of text — best for line-by-line Hindi lists
      tessedit_pageseg_mode: "6",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });
    return worker;
  }

  private resolveTessdataPath() {
    const candidates = [
      process.env.TESSDATA_DIR,
      join(process.cwd(), "apps/api"),
      process.cwd()
    ].filter((value): value is string => Boolean(value));

    return candidates.find(
      (candidate) =>
        existsSync(join(candidate, "eng.traineddata")) &&
        existsSync(join(candidate, "hin.traineddata"))
    );
  }

  private cleanText(text: string) {
    if (!text) return "";

    return text
      .replace(/[\u200b\u200e\u200f]/g, " ")
      .replace(/[\[\]{}|=<>_*~^#$&!@©®\\«»_]+/g, " ")
      .replace(/^[\s\-–—•.]+|[\s\-–—•.]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeRequirementLine(line: string) {
    return normalizeRequirementText(
      line
        .replace(/\bटी\s*\.?\s*वी\s*\.?\b/gi, "tv")
        .replace(/\bफीट\b/g, "ft")
        .replace(/\bपीस\b/g, "pcs")
        .replace(/\bबंडल\b/g, "bundle")
        .replace(/\bनंग\b/g, "नग")
        .replace(/\bवाइर\b/g, "वायर")
        .replace(/\bकोपर\b/g, "कॉपर")
    );
  }

  private isUsefulRequirementLine(line: string, quantity: number | null, unit: string | null, category: string | null) {
    if (!line || isLikelyNoise(line)) {
      return false;
    }

    const hasLanguageContent = /[a-z\u0900-\u097F]/i.test(line);
    if (!hasLanguageContent && quantity == null) {
      return false;
    }

    const tokenCount = line.split(/\s+/).filter(Boolean).length;
    if (tokenCount < 2 && quantity == null && !unit && !category) {
      return false;
    }

    return true;
  }

  private filterAndStructureLines(
    result: TesseractResult,
    width: number,
    height: number
  ): {
    items: ExtractedOcrItem[];
    cleanedRawText: string;
    averageConfidence: number;
    acceptedLineCount: number;
    rejectedLineCount: number;
  } {
    // Traverse blocks to extract lines, compatible with Tesseract.js v6
    const lines: OcrLine[] = [];
    if (result.data?.blocks) {
      for (const block of result.data.blocks) {
        if (block.paragraphs) {
          for (const para of block.paragraphs) {
            if (para.lines) {
              lines.push(...para.lines);
            }
          }
        }
      }
    } else if (result.data?.lines) {
      lines.push(...result.data.lines);
    }

    const items: ExtractedOcrItem[] = [];
    const rawSegments: string[] = [];
    let confidenceSum = 0;
    let confidenceCount = 0;
    let rejectedLineCount = 0;

    for (const [index, line] of lines.entries()) {
      const rawOriginal = line.text ?? "";
      const rawLineText = this.cleanText(rawOriginal);
      const cleanedText = stripListPrefix(rawLineText);

      if (!cleanedText || cleanedText.trim().length < 2) {
        rejectedLineCount += 1;
        continue;
      }

      const lineConfidence = Number(line.confidence ?? 0);
      const normalizedLine = this.normalizeRequirementLine(cleanedText);
      const { quantity, unit } = parseQuantityAndUnit(normalizedLine);
      const category = detectCategory(normalizedLine);

      if (
        lineConfidence < LINE_CONFIDENCE_THRESHOLD &&
        !this.isUsefulRequirementLine(normalizedLine, quantity, unit, category)
      ) {
        rejectedLineCount += 1;
        continue;
      }

      const words = (line.words ?? [])
        .map((word) => {
          const wordText = this.cleanText(word.text ?? "");
          if (!wordText || isLikelyNoise(wordText)) return null;
          return {
            text: wordText,
            confidence: Number(word.confidence ?? 0),
            bbox: toBoundingBoxPercentages(word.bbox, width, height)
          };
        })
        .filter(Boolean);

      if (!this.isUsefulRequirementLine(normalizedLine, quantity, unit, category) && words.length === 0) {
        rejectedLineCount += 1;
        continue;
      }

      confidenceSum += lineConfidence;
      confidenceCount += 1;
      rawSegments.push(cleanedText);
      const isHandwrittenLow = lineConfidence < LOW_CONFIDENCE_THRESHOLD;

      items.push({
        raw_text: cleanedText,
        normalized_text: normalizedLine,
        extracted_quantity: quantity,
        extracted_unit: unit,
        extracted_brand: detectBrand(normalizedLine),
        extracted_specifications: null,
        extracted_dimensions: detectDimensions(normalizedLine),
        extracted_category: category,
        extraction_confidence: Number((lineConfidence / 100).toFixed(2)),
        review_status: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW,
        review_notes: isHandwrittenLow ? "low_ocr_confidence" : null,
        source_line_number: index + 1,
        source_coordinates: {
          page: 1,
          bbox: toBoundingBoxPercentages(line.bbox, width, height),
          words,
          line_confidence: lineConfidence,
          text_length: cleanedText.length
        }
      });
    }

    const averageConfidence = confidenceCount
      ? Number((confidenceSum / confidenceCount).toFixed(2))
      : 0;

    // If nothing was extracted, fall back to inserting each word from the raw OCR output
    // so the admin has SOMETHING to work with instead of one generic error placeholder
    if (!items.length) {
      const rawFullText = this.cleanText(result.data?.text ?? "");
      const fallbackLines = rawFullText
        .split(/\n+/)
        .map((l) => stripListPrefix(l.trim()))
        .filter((l) => l.length >= 2);

      if (fallbackLines.length) {
        fallbackLines.forEach((lineText, i) => {
          const { quantity, unit } = parseQuantityAndUnit(lineText);
          items.push({
            raw_text: lineText,
            normalized_text: normalizeText(lineText),
            extracted_quantity: quantity,
            extracted_unit: unit,
            extracted_brand: detectBrand(lineText),
            extracted_specifications: null,
            extracted_dimensions: detectDimensions(lineText),
            extracted_category: detectCategory(lineText),
            extraction_confidence: 0.1,
            review_status: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW,
            review_notes: "ocr_low_quality_fallback",
            source_line_number: i + 1,
            source_coordinates: { page: 1, bbox: { x: 0, y: 0, w: 100, h: 100 }, words: [] }
          });
        });
      } else {
        // Absolute last resort — single placeholder so batch can still progress
        items.push({
          raw_text: "OCR could not read this image — please re-upload a clearer photo or type requirements manually.",
          normalized_text: null,
          extracted_quantity: null,
          extracted_unit: null,
          extracted_brand: null,
          extracted_specifications: null,
          extracted_dimensions: null,
          extracted_category: null,
          extraction_confidence: 0,
          review_status: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW,
          review_notes: "ocr_failed",
          source_line_number: 1,
          source_coordinates: { page: 1, bbox: { x: 0, y: 0, w: 100, h: 100 }, words: [] }
        });
      }
    }

    return {
      items,
      cleanedRawText: rawSegments.join("\n"),
      averageConfidence,
      acceptedLineCount: items.length,
      rejectedLineCount
    };
  }

  private computeRecognitionScore(recognition: VariantRecognition) {
    const { acceptedLineCount, rejectedLineCount, averageConfidence } = recognition.structured;
    const totalLines = acceptedLineCount + rejectedLineCount;
    const acceptanceRatio = totalLines > 0 ? acceptedLineCount / totalLines : 0;
    const confidenceRatio = averageConfidence / 100;
    const textDensity = Math.min(acceptedLineCount / 8, 1);

    return Number(((confidenceRatio * 0.5) + (acceptanceRatio * 0.35) + (textDensity * 0.15)).toFixed(4));
  }

  private async recognizeBestVariant(
    worker: any,
    preprocessed: Awaited<ReturnType<typeof this.imagePreprocessor.preprocessForTesseract>>
  ) {
    const recognitions: VariantRecognition[] = [];

    for (const variant of preprocessed.variants) {
      const result = (await this.withTimeout(
        worker.recognize(variant.buffer, {}, { blocks: true }) as Promise<TesseractResult>,
        120_000,
        `worker.recognize:${variant.name}`
      )) as TesseractResult;

      const structured = this.filterAndStructureLines(result, variant.width, variant.height);
      const recognition: VariantRecognition = {
        variantName: variant.name,
        structured,
        score: 0
      };
      recognition.score = this.computeRecognitionScore(recognition);
      recognitions.push(recognition);
    }

    recognitions.sort((left, right) => right.score - left.score);
    return recognitions[0];
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

    let rawBuffer: Buffer;
    let preprocessed: Awaited<ReturnType<typeof this.imagePreprocessor.preprocessForTesseract>>;

    try {
      rawBuffer = await this.fetchObjectBuffer(source);
      preprocessed = await this.imagePreprocessor.preprocessForTesseract(rawBuffer);
    } catch (prepErr: any) {
      // Image is corrupt, too small, or unreadable — insert a placeholder item
      const friendlyMessage = prepErr?.message?.includes("too small")
        ? `Image too small to read: ${source.original_filename ?? "uploaded image"}. Please re-upload a clearer, higher-resolution photo.`
        : `Could not preprocess image: ${source.original_filename ?? "uploaded image"}. ${prepErr?.message ?? "Unknown error."}`;

      this.logger.warn(`OCR preprocessing failed for source ${source.id}: ${prepErr?.message}`);

      await this.persistExtractedItems(batch, source.id, [
        {
          raw_text: friendlyMessage,
          normalized_text: null,
          extracted_quantity: null,
          extracted_unit: null,
          extracted_brand: null,
          extracted_specifications: null,
          extracted_dimensions: null,
          extracted_category: null,
          extraction_confidence: 0,
          review_status: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW,
          review_notes: "preprocessing_failed",
          source_coordinates: {},
          source_line_number: 1
        }
      ]);

      return { batchId: payload.batchId, sourceId: payload.sourceId, preprocessingFailed: true };
    }

    const worker = await this.loadTesseractWorker();

    try {
      const bestRecognition = await this.recognizeBestVariant(worker, preprocessed);
      const structured = bestRecognition.structured;
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
              selected_variant: bestRecognition.variantName,
              selected_variant_score: bestRecognition.score,
              flags: lowConfidence ? ["low_ocr_confidence"] : [],
              line_count: structured.items.length,
              rejected_line_count: structured.rejectedLineCount
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
          lowConfidence,
          selectedVariant: bestRecognition.variantName,
          selectedVariantScore: bestRecognition.score
        },
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      });

      return {
        batchId: batch.id,
        sourceId: source.id,
        itemCount: savedItems.length,
        averageConfidence: structured.averageConfidence,
        lowConfidence,
        selectedVariant: bestRecognition.variantName
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
