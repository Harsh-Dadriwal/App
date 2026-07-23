import assert from "node:assert/strict";
import test from "node:test";
import { REQUIREMENT_REVIEW_STATUS } from "@mahalaxmi/core/types/domain";
import { RequirementsService } from "./requirements.service";

function createService() {
  return new RequirementsService({} as any, {} as any, {} as any, {} as any, {} as any);
}

test("parsePlainText extracts quantity, unit, brand, and category from requirement lines", () => {
  const service = createService();

  const items = (service as any).parsePlainText("Havells wire 2 coil\nSwitch board", "source-1");

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    sourceId: "source-1",
    sourceLineNumber: 1,
    rawText: "Havells wire 2 coil",
    normalizedText: "havells wire 2 coil",
    extractedQuantity: 2,
    extractedUnit: null,
    extractedBrand: "havells",
    extractedSpecifications: null,
    extractedDimensions: null,
    extractedCategory: "wiring",
    extractionConfidence: 0.82,
    reviewStatus: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
  });
  assert.equal(items[1].extractedCategory, "switches");
  assert.equal(items[1].extractionConfidence, 0.58);
});

test("parseCsv merges cells and preserves trailing specifications", () => {
  const service = createService();

  const items = (service as any).parseCsv("Anchor switch, 4 pcs, modular white", "source-2");

  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    sourceId: "source-2",
    sourceLineNumber: 1,
    rawText: "Anchor switch, 4 pcs, modular white",
    normalizedText: "anchor switch 4 pcs modular white",
    extractedQuantity: 4,
    extractedUnit: "pcs",
    extractedBrand: "anchor",
    extractedSpecifications: "modular white",
    extractedDimensions: null,
    extractedCategory: "switches",
    extractionConfidence: 0.74,
    reviewStatus: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW
  });
});

test("computeTokenScore rewards shared tokens and createManualReviewPlaceholder preserves operator context", () => {
  const service = createService();

  assert.equal((service as any).computeTokenScore("anchor switch 2 pcs", "anchor switch modular"), 0.5);
  assert.equal((service as any).computeTokenScore("", "anything"), 0);
  assert.equal((service as any).computeTokenScore("anchor", ""), 0);
  assert.deepEqual((service as any).createManualReviewPlaceholder({ id: "source-9", original_filename: "quote.pdf" }), [
    {
      sourceId: "source-9",
      rawText: "Manual review required for quote.pdf",
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
  ]);
});
