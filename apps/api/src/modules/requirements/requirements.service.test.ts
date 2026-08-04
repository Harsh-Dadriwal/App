import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIREMENT_BATCH_STATUS,
  REQUIREMENT_REVIEW_STATUS,
  REQUIREMENT_SOURCE_TYPE
} from "@mahalaxmi/core/types/domain";
import { RequirementsService } from "./requirements.service";

function createService() {
  return new RequirementsService({} as any, {} as any, {} as any, {} as any, {} as any);
}

function createWorkflowServiceMocks() {
  const calls = {
    updates: [] as Array<{ table: string; values: Record<string, unknown>; filters: Array<{ column: string; value: unknown }> }>,
    inserts: [] as Array<{ table: string; values: any }>,
    deletes: [] as Array<{ table: string; filters: Array<{ column: string; value: unknown }>; inFilters: Array<{ column: string; values: unknown[] }> }>
  };

  const products = [
    {
      id: "prod-1",
      tenant_id: "tenant-1",
      item_name: "Anchor switch modular",
      sku: "SW-1",
      unit: "pcs",
      base_price: 120,
      stock_status: "in_stock",
      is_active: true
    },
    {
      id: "prod-2",
      tenant_id: "tenant-1",
      item_name: "Copper wire roll",
      sku: "WR-1",
      unit: "roll",
      base_price: 250,
      stock_status: "out_of_stock",
      is_active: true
    }
  ];

  function createQuery(table: string, defaultData: any = null) {
    const state = {
      filters: [] as Array<{ column: string; value: unknown }>,
      inFilters: [] as Array<{ column: string; values: unknown[] }>,
      action: "select" as "select" | "update" | "insert" | "delete",
      values: undefined as any,
      selected: defaultData
    };

    const execute = async () => {
      if (state.action === "update") {
        calls.updates.push({ table, values: state.values, filters: state.filters });
        return { data: state.selected, error: null };
      }
      if (state.action === "insert") {
        calls.inserts.push({ table, values: state.values });
        return { data: state.selected, error: null };
      }
      if (state.action === "delete") {
        calls.deletes.push({ table, filters: state.filters, inFilters: state.inFilters });
        return { data: null, error: null };
      }
      return { data: state.selected, error: null };
    };

    const builder = {
      select(_columns: string) {
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push({ column, value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        state.inFilters.push({ column, values });
        return builder;
      },
      order(_column: string, _options?: Record<string, unknown>) {
        return builder;
      },
      update(values: Record<string, unknown>) {
        state.action = "update";
        state.values = values;
        return builder;
      },
      insert(values: any) {
        state.action = "insert";
        state.values = values;
        return builder;
      },
      delete() {
        state.action = "delete";
        return builder;
      },
      maybeSingle() {
        if (table === "products") {
          const idFilter = state.filters.find((entry) => entry.column === "id")?.value;
          state.selected = products.find((product) => product.id === idFilter) ?? null;
        }
        if (table === "sites") {
          state.selected = { id: "site-1", customer_id: "customer-1", approval_mode: "architect_then_customer" };
        }
        return execute();
      },
      single() {
        if (table === "site_orders") {
          state.selected = { id: "site-order-1" };
        }
        return execute();
      },
      then(onFulfilled: (value: any) => any, onRejected?: (reason: unknown) => any) {
        if (table === "products") {
          state.selected = products;
        }
        return execute().then(onFulfilled, onRejected);
      }
    };

    return builder;
  }

  const supabaseAdmin = {
    getClient: () => ({
      from(table: string) {
        return createQuery(table);
      }
    }),
    getReadClient: () => ({
      from(table: string) {
        return createQuery(table, table === "products" ? products : null);
      }
    })
  };

  return { supabaseAdmin, calls, products };
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

test("runMatchStage ranks product candidates, updates items, and publishes review-required events", async () => {
  const { supabaseAdmin, calls } = createWorkflowServiceMocks();
  const published: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const service = new RequirementsService(
    supabaseAdmin as any,
    {} as any,
    {} as any,
    {
      publish: async (eventName: string, payload: Record<string, unknown>) => {
        published.push({ eventName, payload });
      }
    } as any,
    {} as any
  );

  service["getBatchRow"] = async () => ({ id: "batch-1", tenant_id: "tenant-1" } as any);
  service["getBatchItems"] = async () => [
    {
      id: "item-1",
      raw_text: "Anchor switch 2 pcs",
      normalized_text: "anchor switch 2 pcs",
      extracted_brand: "anchor"
    }
  ];
  service["updateBatchStatus"] = async (...args: unknown[]) => {
    calls.updates.push({ table: "requirement_batches_status", values: args[1] as Record<string, unknown>, filters: [] });
  };
  service["logStage"] = async (payload: Record<string, unknown>) => {
    calls.inserts.push({ table: "requirement_batch_processing_jobs", values: payload });
  };

  await service["runMatchStage"]("batch-1");

  const itemUpdate = calls.updates.find((entry) => entry.table === "requirement_batch_items");
  assert(itemUpdate);
  assert.equal(itemUpdate.values.matched_product_id, "prod-1");
  assert.equal(itemUpdate.values.review_status, REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW);
  assert.equal(itemUpdate.values.match_confidence, 0.72);

  const candidateInsert = calls.inserts.find((entry) => entry.table === "requirement_batch_item_candidates");
  assert(candidateInsert);
  assert.equal(candidateInsert.values.length, 2);
  assert.equal(candidateInsert.values[0].candidate_product_id, "prod-1");

  const batchUpdate = calls.updates.find((entry) => entry.table === "requirement_batches_status");
  assert(batchUpdate);
  assert.equal(batchUpdate.values.status, REQUIREMENT_BATCH_STATUS.AWAITING_REVIEW);
  assert.equal(batchUpdate.values.review_status, REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW);
  assert.equal(batchUpdate.values.overall_confidence, 0.72);

  assert.deepEqual(published, [
    {
      eventName: "requirement.review_required",
      payload: {
        requirementBatchId: "batch-1",
        tenantId: "tenant-1",
        reviewStatus: REQUIREMENT_REVIEW_STATUS.NEEDS_REVIEW,
        overallConfidence: 0.72
      }
    }
  ]);
});

test("generateProcurement returns an existing generated order without creating anything new", async () => {
  const { supabaseAdmin, calls } = createWorkflowServiceMocks();
  const service = new RequirementsService(
    supabaseAdmin as any,
    {} as any,
    {} as any,
    { publish: async () => undefined } as any,
    {} as any
  );

  service["getBatchRow"] = async () => ({
    id: "batch-1",
    tenant_id: "tenant-1",
    site_id: "site-1",
    generated_site_order_id: "site-order-existing"
  } as any);
  service["assertReviewAccess"] = async () => undefined;

  const result = await service.generateProcurement(
    { appUserId: "admin-1", role: "admin" } as any,
    "batch-1",
    {} as any
  );

  assert.deepEqual(result, {
    batchId: "batch-1",
    siteOrderId: "site-order-existing",
    createdOrderItems: 0,
    createdProductRequests: 0
  });
  assert.equal(calls.inserts.length, 0);
});

test("generateProcurement creates order items and product requests from approved requirement items", async () => {
  const { supabaseAdmin, calls } = createWorkflowServiceMocks();
  const published: Array<{ eventName: string; payload: Record<string, unknown> }> = [];
  const service = new RequirementsService(
    supabaseAdmin as any,
    {} as any,
    {} as any,
    {
      publish: async (eventName: string, payload: Record<string, unknown>) => {
        published.push({ eventName, payload });
      }
    } as any,
    {} as any
  );

  const originalRandom = Math.random;
  Math.random = () => 0.1234;

  service["getBatchRow"] = async () => ({
    id: "batch-1",
    tenant_id: "tenant-1",
    site_id: "site-1",
    generated_site_order_id: null
  } as any);
  service["assertReviewAccess"] = async () => undefined;
  service["getBatchItems"] = async () => [
    {
      id: "item-1",
      review_status: REQUIREMENT_REVIEW_STATUS.APPROVED,
      matched_product_id: "prod-1",
      extracted_quantity: 3,
      extracted_category: "switches",
      extracted_brand: "anchor",
      raw_text: "Anchor switch 3 pcs",
      normalized_text: "anchor switch 3 pcs"
    },
    {
      id: "item-2",
      review_status: REQUIREMENT_REVIEW_STATUS.APPROVED,
      matched_product_id: null,
      extracted_quantity: null,
      extracted_category: "wiring",
      extracted_brand: "havells",
      raw_text: "Need wire spool",
      normalized_text: "need wire spool"
    }
  ];
  service["updateBatchStatus"] = async (...args: unknown[]) => {
    calls.updates.push({ table: "requirement_batches_status", values: args[1] as Record<string, unknown>, filters: [] });
  };

  try {
    const result = await service.generateProcurement(
      { appUserId: "admin-1", role: "admin" } as any,
      "batch-1",
      {} as any
    );

    assert.equal(result.siteOrderId, "site-order-1");
    assert.equal(result.createdOrderItems, 1);
    assert.equal(result.createdProductRequests, 1);
  } finally {
    Math.random = originalRandom;
  }

  const siteOrderInsert = calls.inserts.find((entry) => entry.table === "site_orders");
  assert(siteOrderInsert);
  assert.equal(siteOrderInsert.values.order_number, `REQ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-1234`);

  const orderItemInsert = calls.inserts.find((entry) => entry.table === "order_items");
  assert(orderItemInsert);
  assert.equal(orderItemInsert.values.quantity_required, 3);
  assert.equal(orderItemInsert.values.line_total, 360);

  const productRequestInsert = calls.inserts.find((entry) => entry.table === "product_requests");
  assert(productRequestInsert);
  assert.equal(productRequestInsert.values.title, "need wire spool");

  const siteOrderUpdate = calls.updates.find((entry) => entry.table === "site_orders");
  assert(siteOrderUpdate);
  assert.equal(siteOrderUpdate.values.subtotal_amount, 360);

  const batchUpdate = calls.updates.find((entry) => entry.table === "requirement_batches_status");
  assert(batchUpdate);
  assert.equal(batchUpdate.values.status, REQUIREMENT_BATCH_STATUS.GENERATED);
  assert.equal(batchUpdate.values.review_status, REQUIREMENT_REVIEW_STATUS.APPROVED);
  assert.equal(batchUpdate.values.generated_site_order_id, "site-order-1");

  assert.deepEqual(published, [
    {
      eventName: "requirement.procurement_generated",
      payload: {
        requirementBatchId: "batch-1",
        tenantId: "tenant-1",
        siteOrderId: "site-order-1",
        createdOrderItems: 1,
        createdProductRequests: 1
      }
    }
  ]);
});

test("generateProcurement rejects batches with no approved or matchable items", async () => {
  const { supabaseAdmin } = createWorkflowServiceMocks();
  const service = new RequirementsService(
    supabaseAdmin as any,
    {} as any,
    {} as any,
    { publish: async () => undefined } as any,
    {} as any
  );
  service["getBatchRow"] = async () => ({
    id: "batch-1",
    tenant_id: "tenant-1",
    site_id: "site-1",
    generated_site_order_id: null
  } as any);
  service["assertReviewAccess"] = async () => undefined;
  service["getBatchItems"] = async () => [
    { id: "item-1", review_status: REQUIREMENT_REVIEW_STATUS.REJECTED, matched_product_id: null }
  ];

  await assert.rejects(
    () => service.generateProcurement({ appUserId: "admin-1", role: "admin" } as any, "batch-1", {} as any),
    /No approved requirement items are ready for procurement/
  );
});

test("runExtractStage parses text and csv sources, queues OCR, and falls back to manual review", async () => {
  const service = createService();
  const enqueued: Array<{ queueName: string; jobName: string; payload: Record<string, unknown> }> = [];
  let persistedItems: any[] = [];
  let loggedStage: any = null;

  service["getBatchRow"] = async () => ({ id: "batch-1", tenant_id: "tenant-1" } as any);
  service["getBatchSources"] = async () => [
    { id: "src-text", source_type: REQUIREMENT_SOURCE_TYPE.PLAIN_TEXT, raw_text: "Anchor switch 2 pcs" },
    { id: "src-csv", source_type: REQUIREMENT_SOURCE_TYPE.CSV, raw_text: "Havells wire, 4 pcs, red" },
    { id: "src-ocr", source_type: REQUIREMENT_SOURCE_TYPE.IMAGE, raw_text: null },
    { id: "src-manual", source_type: REQUIREMENT_SOURCE_TYPE.PDF, raw_text: null, original_filename: "scan.pdf" }
  ] as any;
  service["clearBatchArtifacts"] = async () => undefined;
  service["enqueueOrRun"] = async (queueName: string, jobName: string, payload: Record<string, unknown>) => {
    enqueued.push({ queueName, jobName, payload });
  };
  service["persistExtractedItems"] = async (_batch: unknown, items: any[]) => {
    persistedItems = items;
    return items;
  };
  service["logStage"] = async (payload: Record<string, unknown>) => {
    loggedStage = payload;
  };

  await service["runExtractStage"]("batch-1");

  assert.equal(persistedItems.length, 3);
  assert.equal(persistedItems[0].rawText, "Anchor switch 2 pcs");
  assert.equal(persistedItems[1].rawText, "Havells wire, 4 pcs, red");
  assert.equal(persistedItems[2].rawText, "Manual review required for scan.pdf");
  assert.equal(enqueued.length, 2);
  assert.equal(enqueued[0].payload.sourceId, "src-ocr");
  assert.equal(loggedStage?.stage, "extract");
  assert.equal((loggedStage?.outputPayload as Record<string, unknown>).itemCount, 3);
  assert.equal((loggedStage?.outputPayload as Record<string, unknown>).ocrQueued, 1);
});
