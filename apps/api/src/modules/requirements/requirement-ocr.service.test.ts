import assert from "node:assert/strict";
import test from "node:test";
import { REQUIREMENT_REVIEW_STATUS } from "@mahalaxmi/core/types/domain";
import { RequirementOcrService } from "./requirement-ocr.service";

function createService() {
  return new RequirementOcrService({} as any, {} as any);
}

test("filterAndStructureLines keeps useful numbered OCR lines and extracts Hindi quantities", () => {
  const service = createService();

  const structured = (service as any).filterAndStructureLines(
    {
      data: {
        lines: [
          {
            text: "14) Havells wire 4 नग",
            confidence: 72,
            bbox: { x0: 20, y0: 10, x1: 180, y1: 40 },
            words: [
              { text: "Havells", confidence: 85, bbox: { x0: 20, y0: 10, x1: 60, y1: 40 } },
              { text: "wire", confidence: 80, bbox: { x0: 70, y0: 10, x1: 110, y1: 40 } },
              { text: "4", confidence: 90, bbox: { x0: 120, y0: 10, x1: 130, y1: 40 } },
              { text: "नग", confidence: 88, bbox: { x0: 140, y0: 10, x1: 160, y1: 40 } }
            ]
          },
          {
            text: "10:30 AM",
            confidence: 18,
            bbox: { x0: 10, y0: 50, x1: 80, y1: 70 },
            words: []
          }
        ],
        text: "14) Havells wire 4 नग\n10:30 AM"
      }
    },
    200,
    100
  );

  assert.equal(structured.items.length, 1);
  assert.equal(structured.rejectedLineCount, 1);
  assert.equal(structured.averageConfidence, 72);
  assert.equal(structured.cleanedRawText, "Havells wire 4 नग");
  assert.equal(structured.items[0].raw_text, "Havells wire 4 नग");
  assert.equal(structured.items[0].normalized_text, "havells wire 4 नग");
  assert.equal(structured.items[0].extracted_quantity, 4);
  assert.equal(structured.items[0].extracted_unit, "nos");
  assert.equal(structured.items[0].extracted_brand, "havells");
  assert.equal(structured.items[0].extracted_category, "wiring");
  assert.equal(structured.items[0].extraction_confidence, 0.72);
  assert.equal(structured.items[0].review_status, REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW);
  assert.equal(structured.items[0].review_notes, null);
  assert.equal(structured.items[0].source_line_number, 1);
  assert.deepEqual(structured.items[0].source_coordinates.bbox, { x: 10, y: 10, w: 80, h: 30 });
  assert.equal(structured.items[0].source_coordinates.line_confidence, 72);
  assert.equal(structured.items[0].source_coordinates.text_length, 17);
  assert.deepEqual(structured.items[0].source_coordinates.words, [
    { text: "Havells", confidence: 85, bbox: { x: 10, y: 10, w: 20, h: 30 } },
    { text: "wire", confidence: 80, bbox: { x: 35, y: 10, w: 20, h: 30 } },
    { text: "नग", confidence: 88, bbox: { x: 70, y: 10, w: 10, h: 30 } }
  ]);
});

test("filterAndStructureLines does not mistake timestamps for numbered list prefixes", () => {
  const service = createService();

  const structured = (service as any).filterAndStructureLines(
    {
      data: {
        lines: [
          {
            text: "10:30 AM",
            confidence: 18,
            bbox: { x0: 10, y0: 50, x1: 80, y1: 70 },
            words: []
          }
        ],
        text: "10:30 AM"
      }
    },
    100,
    100
  );

  assert.equal(structured.items.length, 1);
  assert.equal(structured.items[0].raw_text, "10:30 AM");
  assert.equal(structured.items[0].normalized_text, "10:30 am");
});

test("filterAndStructureLines falls back to raw OCR text when no line survives filtering", () => {
  const service = createService();

  const structured = (service as any).filterAndStructureLines(
    {
      data: {
        lines: [
          {
            text: "%",
            confidence: 5,
            bbox: { x0: 0, y0: 0, x1: 5, y1: 5 },
            words: []
          }
        ],
        text: "1) Anchor switch 2 pcs"
      }
    },
    100,
    100
  );

  assert.equal(structured.items.length, 1);
  assert.equal(structured.items[0].raw_text, "Anchor switch 2 pcs");
  assert.equal(structured.items[0].normalized_text, "anchor switch 2 pcs");
  assert.equal(structured.items[0].extracted_brand, "anchor");
  assert.equal(structured.items[0].extracted_category, "switches");
  assert.equal(structured.items[0].review_notes, "ocr_low_quality_fallback");
  assert.equal(structured.items[0].source_coordinates.bbox.x, 0);
});

test("filterAndStructureLines creates a manual placeholder when OCR text is completely unusable", () => {
  const service = createService();

  const structured = (service as any).filterAndStructureLines(
    {
      data: {
        lines: [],
        text: ""
      }
    },
    100,
    100
  );

  assert.equal(structured.items.length, 1);
  assert.equal(
    structured.items[0].raw_text,
    "OCR could not read this image — please re-upload a clearer photo or type requirements manually."
  );
  assert.equal(structured.items[0].review_notes, "ocr_failed");
  assert.equal(structured.items[0].extraction_confidence, 0);
});
