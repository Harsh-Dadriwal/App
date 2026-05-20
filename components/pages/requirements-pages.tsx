"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  RequirementBatch,
  RequirementBatchItem,
  RequirementBatchItemCandidate,
  RequirementReviewStatus
} from "@mahalaxmi/core/types/domain";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { getServeUrl } from "@/lib/s3";
import { useAuth } from "@/components/providers/auth-provider";
import {
  CardGrid,
  DataCard,
  DataTable,
  FormCard,
  FormFieldHint,
  FormGrid,
  FormNotice,
  FormSectionHeader,
  ListSearchField,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import {
  createRequirementTextBatch,
  createRequirementUploadBatch,
  deleteRequirementBatch,
  generateRequirementProcurement,
  getRequirementBatch,
  listRequirementBatches,
  reviewRequirementBatchItem,
  updateRequirementBatch
} from "@/lib/backend/modules/requirements-gateway";

type IntakeRole = "customer" | "electrician" | "architect";

type BatchListState = {
  data: RequirementBatch[];
  loading: boolean;
  error: string | null;
};

type BatchDetailState = {
  data:
    | (RequirementBatch & {
        sources?: Array<any>;
        items?: Array<RequirementBatchItem & { candidates?: RequirementBatchItemCandidate[] }>;
      })
    | null;
  loading: boolean;
  error: string | null;
};

function formatStatus(value: string | null | undefined) {
  return String(value ?? "-")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRelativeDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString("en-IN")} ${date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function formatPercent(value: number | null | undefined, scale: "ratio" | "whole" = "ratio") {
  if (value == null || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  const percent = scale === "whole" ? numeric : numeric * 100;
  return `${Math.round(percent)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getOcrMetadata(source: { metadata_json?: Record<string, unknown> | null }) {
  if (!isRecord(source.metadata_json)) {
    return null;
  }

  const ocr = source.metadata_json.ocr;
  return isRecord(ocr) ? ocr : null;
}

function isImageSource(source: { mime_type?: string | null; source_type?: string | null }) {
  return (
    String(source.mime_type ?? "").startsWith("image/") ||
    ["image", "handwritten_image", "whatsapp_screenshot"].includes(String(source.source_type ?? ""))
  );
}

function roleSourceChannel(role: IntakeRole) {
  switch (role) {
    case "electrician":
      return "electrician_requirement";
    case "architect":
      return "architect_requirement";
    default:
      return "customer_requirement";
  }
}

function useRequirementBatches() {
  const [state, setState] = useState<BatchListState>({
    data: [],
    loading: true,
    error: null
  });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    const result = await listRequirementBatches();
    setState({
      data: (result.data ?? []) as RequirementBatch[],
      loading: false,
      error: result.error ?? null
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 8s — silently catches errors if API is offline
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const result = await listRequirementBatches();
        if (result.error) return; // API returned an error — keep current state
        const batches = (result.data ?? []) as RequirementBatch[];
        setState((current) => {
          const stillSame =
            JSON.stringify(current.data.map((b) => b.status)) ===
            JSON.stringify(batches.map((b) => b.status));
          if (stillSame) return current;
          return { ...current, data: batches };
        });
      } catch {
        // Network error or API offline — ignore silently
      }
    }, 8_000);
    return () => clearInterval(interval);
  }, []);

  // Listen for global database mutations to instantly refresh the batches list
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMutation = () => {
      void load();
    };

    window.addEventListener("supabase-mutation", handleMutation);
    return () => {
      window.removeEventListener("supabase-mutation", handleMutation);
    };
  }, [load]);

  return {
    ...state,
    refetch: load
  };
}

function useRequirementBatchDetail(batchId: string | null) {
  const [state, setState] = useState<BatchDetailState>({
    data: null,
    loading: false,
    error: null
  });

  const load = useCallback(async () => {
    if (!batchId) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    setState((current) => ({ ...current, loading: true, error: null }));
    const result = await getRequirementBatch(batchId);
    setState({
      data: (result.data as BatchDetailState["data"]) ?? null,
      loading: false,
      error: result.error ?? null
    });
  }, [batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Silently auto-refresh details every 5 seconds so background OCR results appear in real-time
  useEffect(() => {
    if (!batchId) return;

    const interval = setInterval(async () => {
      try {
        const result = await getRequirementBatch(batchId);
        if (result.error || !result.data) return;
        const detail = result.data as BatchDetailState["data"];

        setState((current) => {
          if (!detail) return current;
          if (!current.data) {
            return { ...current, data: detail };
          }
          const currentItemsCount = current.data.items?.length ?? 0;
          const newItemsCount = detail.items?.length ?? 0;
          const statusChanged = current.data.status !== detail.status;

          if (currentItemsCount === newItemsCount && !statusChanged) {
            return current;
          }
          return { ...current, data: detail };
        });
      } catch {
        // Ignore network hiccups silently
      }
    }, 5_000);

    return () => clearInterval(interval);
  }, [batchId]);

  // Listen for global database mutations to instantly refresh the batch details
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMutation = () => {
      void load();
    };

    window.addEventListener("supabase-mutation", handleMutation);
    return () => {
      window.removeEventListener("supabase-mutation", handleMutation);
    };
  }, [load]);

  return {
    ...state,
    refetch: load
  };
}

function RequirementItemsTable({
  items
}: {
  items: Array<RequirementBatchItem & { candidates?: RequirementBatchItemCandidate[] }>;
}) {
  return (
    <DataTable
      columns={[
        "Raw line",
        "Quantity",
        "Unit",
        "Category",
        "Matched product",
        "Match confidence",
        "Review status"
      ]}
      rows={items.map((item) => [
        item.raw_text,
        item.extracted_quantity ?? "-",
        item.extracted_unit ?? "-",
        item.extracted_category ?? "-",
        item.matched_product_id ?? "-",
        item.match_confidence != null ? `${Math.round(Number(item.match_confidence) * 100)}%` : "-",
        formatStatus(item.review_status)
      ])}
    />
  );
}

function OcrDebugCard({ source }: { source: any }) {
  const ocr = getOcrMetadata(source);
  if (!ocr) {
    return null;
  }

  const flags = Array.isArray(ocr.flags) ? ocr.flags : [];
  const rawPreview =
    typeof source.raw_text === "string" && source.raw_text.trim()
      ? source.raw_text.trim().slice(0, 500)
      : null;

  return (
    <DataCard
      title={`${source.original_filename ?? source.source_type} OCR debug`}
      subtitle={`Variant: ${String(ocr.selected_variant ?? "primary")}`}
      meta={formatPercent(
        typeof ocr.average_confidence === "number" ? ocr.average_confidence : null,
        "whole"
      )}
    >
      <p>Average OCR confidence: {formatPercent(typeof ocr.average_confidence === "number" ? ocr.average_confidence : null, "whole")}</p>
      <p>Variant score: {typeof ocr.selected_variant_score === "number" ? ocr.selected_variant_score.toFixed(2) : "-"}</p>
      <p>Accepted lines: {String(ocr.line_count ?? "-")}</p>
      <p>Rejected lines: {String(ocr.rejected_line_count ?? "-")}</p>
      <p>Image size: {String(ocr.width ?? "-")} x {String(ocr.height ?? "-")} @ {String(ocr.density ?? "-")} DPI</p>
      <p>Flags: {flags.length ? flags.join(", ") : "none"}</p>
      {rawPreview ? (
        <div style={{ marginTop: 12 }}>
          <strong>OCR text preview</strong>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              borderRadius: 10,
              background: "rgba(148, 163, 184, 0.12)",
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.5
            }}
          >
            {rawPreview}
          </pre>
        </div>
      ) : null}
    </DataCard>
  );
}

function SideBySideOcrWorkspace({ source }: { source: any }) {
  const isImage = isImageSource(source);
  const serveUrl = getServeUrl(source.public_url);
  const [zoom, setZoom] = useState(100);

  return (
    <div 
      style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", 
        gap: 24, 
        backgroundColor: "var(--bg-card, #fff)", 
        border: "1px solid var(--border-color, #e2e8f0)", 
        borderRadius: 16, 
        padding: 24, 
        marginBottom: 28,
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)"
      }}
    >
      {/* Left side: Original Image / Source */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary, #1e293b)" }}>
            🖼️ Original Document Sheet
          </h3>
          {isImage && (
            <div style={{ display: "flex", gap: 8 }}>
              <button 
                type="button" 
                className="secondary-button" 
                style={{ padding: "4px 10px", fontSize: 12, height: 28 }}
                onClick={() => setZoom(z => Math.max(50, z - 25))}
              >
                🔍- Out
              </button>
              <button 
                type="button" 
                className="secondary-button" 
                style={{ padding: "4px 10px", fontSize: 12, height: 28 }}
                onClick={() => setZoom(100)}
              >
                Reset
              </button>
              <button 
                type="button" 
                className="secondary-button" 
                style={{ padding: "4px 10px", fontSize: 12, height: 28 }}
                onClick={() => setZoom(z => Math.min(300, z + 25))}
              >
                🔍+ In
              </button>
            </div>
          )}
        </div>
        
        {isImage ? (
          <div 
            style={{ 
              border: "1px solid rgba(148, 163, 184, 0.25)", 
              borderRadius: 12, 
              overflow: "auto", 
              height: 480, 
              background: "#f8fafc",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
              padding: 12
            }}
          >
            <img
              src={serveUrl}
              alt={source.original_filename ?? "Original source"}
              style={{
                width: `${zoom}%`,
                height: "auto",
                maxWidth: zoom === 100 ? "100%" : "none",
                maxHeight: zoom === 100 ? 450 : "none",
                objectFit: "contain",
                transition: "width 0.15s ease",
                borderRadius: 8
              }}
            />
          </div>
        ) : (
          <div 
            style={{ 
              border: "1px solid rgba(148, 163, 184, 0.25)", 
              borderRadius: 12, 
              padding: 24, 
              background: "#f8fafc", 
              textAlign: "center",
              height: 480,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center"
            }}
          >
            <p style={{ color: "var(--text-secondary, #64748b)", margin: "0 0 16px 0" }}>
              Non-image source file ({source.mime_type ?? "unknown type"})
            </p>
            {serveUrl && (
              <a
                href={serveUrl}
                target="_blank"
                rel="noreferrer"
                className="secondary-button"
                style={{ textDecoration: "none", display: "inline-block" }}
              >
                Open Original File
              </a>
            )}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted, #64748b)" }}>
          <span>File: <strong>{source.original_filename ?? "unnamed"}</strong></span>
          <span>Uploaded: <strong>{new Date(source.created_at).toLocaleString("en-IN")}</strong></span>
        </div>
      </div>

      {/* Right side: OCR Parsed Text */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text-primary, #1e293b)" }}>
          📝 Extracted Digital Text
        </h3>
        <div 
          style={{ 
            border: "1px solid rgba(148, 163, 184, 0.25)", 
            borderRadius: 12, 
            padding: 18, 
            background: "#0f172a", 
            color: "#e2e8f0", 
            overflow: "auto", 
            height: 480,
            display: "flex",
            flexDirection: "column"
          }}
        >
          {source.raw_text ? (
            <pre 
              style={{ 
                margin: 0, 
                whiteSpace: "pre-wrap", 
                fontSize: 13, 
                fontFamily: "monospace", 
                lineHeight: 1.6, 
                color: "#38bdf8" 
              }}
            >
              {source.raw_text}
            </pre>
          ) : (
            <div style={{ margin: "auto", textAlign: "center", color: "#94a3b8" }}>
              <p>No OCR text was extracted for this source yet.</p>
              <small>Wait for the background queue worker or run text extraction.</small>
            </div>
          )}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-muted, #64748b)" }}>
          <span>OCR Accuracy: <strong>{getOcrConfidenceText(source)}</strong></span>
          {source.raw_text && (
            <button
              type="button"
              className="secondary-button"
              style={{ padding: "4px 8px", fontSize: 12, height: 28 }}
              onClick={() => {
                navigator.clipboard.writeText(source.raw_text);
                alert("Extracted text copied to clipboard!");
              }}
            >
              📋 Copy Text
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function getOcrConfidenceText(source: any): string {
  const ocr = getOcrMetadata(source);
  if (!ocr || typeof ocr.average_confidence !== "number") return "N/A";
  return `${Math.round(ocr.average_confidence)}%`;
}

function RequirementReviewItemCard({
  item,
  onUpdateReviewStatus
}: {
  item: RequirementBatchItem & { candidates?: RequirementBatchItemCandidate[] };
  onUpdateReviewStatus: (itemId: string, reviewStatus: RequirementReviewStatus) => Promise<void>;
}) {
  const topCandidates = (item.candidates ?? []).slice(0, 3);
  const bestCandidate = topCandidates[0] ?? null;

  return (
    <DataCard
      key={item.id}
      title={item.raw_text}
      subtitle={item.normalized_text ?? "Normalization pending"}
      meta={formatStatus(item.review_status)}
    >
      <p>
        Qty / Unit: {item.extracted_quantity ?? "-"} {item.extracted_unit ?? ""}
      </p>
      <p>Category: {item.extracted_category ?? "-"}</p>
      <p>Extraction confidence: {formatPercent(item.extraction_confidence)}</p>
      <p>Match confidence: {formatPercent(item.match_confidence)}</p>
      {bestCandidate ? (
        <div style={{ marginTop: 10 }}>
          <strong>Best candidate</strong>
          <p style={{ marginTop: 6 }}>
            {bestCandidate.candidate_product_id} · {formatPercent(bestCandidate.final_score)}
          </p>
          {topCandidates.length > 1 ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>Show other suggestions</summary>
              <div style={{ marginTop: 8 }}>
                {topCandidates.slice(1).map((candidate) => (
                  <p key={candidate.id} style={{ margin: "4px 0" }}>
                    {candidate.candidate_product_id} · {formatPercent(candidate.final_score)}
                  </p>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
      <div className="button-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void onUpdateReviewStatus(item.id, "approved")}
        >
          Approve
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void onUpdateReviewStatus(item.id, "needs_review")}
        >
          Keep in review
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void onUpdateReviewStatus(item.id, "rejected")}
        >
          Reject
        </button>
      </div>
    </DataCard>
  );
}

export function RequirementIntakePage({ role }: { role: IntakeRole }) {
  const { profile } = useAuth();
  const actorId = profile?.id ?? "";
  const mutation = useMutationAction();
  const batches = useRequirementBatches();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const selectedBatch = useRequirementBatchDetail(selectedBatchId);
  const [rawText, setRawText] = useState("");
  const [siteId, setSiteId] = useState("");
  const [inputLanguage, setInputLanguage] = useState("mixed");
  const [sourceChannel, setSourceChannel] = useState(roleSourceChannel(role));
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const siteOptions = useRows(
    async (client) => {
      if (!actorId) {
        return { data: [], error: null };
      }

      if (role === "customer") {
        const { data, error } = await client
          .from("sites")
          .select("id, site_name")
          .eq("customer_id", actorId)
          .order("site_name");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      if (role === "electrician") {
        const { data, error } = await client
          .from("vw_electrician_ongoing_projects")
          .select("site_id, site_name")
          .eq("electrician_id", actorId);
        return {
          data: (data ?? []).map((row: any) => ({ id: row.site_id, site_name: row.site_name })) as any[],
          error: error?.message ?? null
        };
      }

      const { data, error } = await client
        .from("vw_architect_ongoing_projects")
        .select("site_id, site_name")
        .eq("architect_id", actorId);
      return {
        data: (data ?? []).map((row: any) => ({ id: row.site_id, site_name: row.site_name })) as any[],
        error: error?.message ?? null
      };
    },
    [actorId, role]
  );

  const visibleBatches = useMemo(() => batches.data.slice(0, 12), [batches.data]);

  useEffect(() => {
    if (!selectedBatchId && visibleBatches[0]?.id) {
      setSelectedBatchId(visibleBatches[0].id);
    }
  }, [selectedBatchId, visibleBatches]);

  async function handleDeleteBatch(batchId: string) {
    if (
      !window.confirm(
        "Are you sure you want to delete this requirement batch and all extracted lines? This action is permanent."
      )
    ) {
      return;
    }

    const ok = await mutation.run(
      () => deleteRequirementBatch(batchId),
      "Requirement batch deleted successfully."
    );

    if (!ok) return;

    if (selectedBatchId === batchId) {
      setSelectedBatchId(null);
    }
    await batches.refetch();
  }

  async function handleTextSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutation.run(async () => {
      if (!rawText.trim()) {
        throw new Error("Paste or type a requirement note first.");
      }
      return createRequirementTextBatch({
        raw_text: rawText.trim(),
        site_id: siteId || null,
        input_language: inputLanguage,
        source_channel: sourceChannel
      });
    }, "Requirement batch queued for extraction.");

    if (!ok) return;

    setRawText("");
    await batches.refetch();
  }

  async function handleFileUpload() {
    const ok = await mutation.run(async () => {
      if (!uploadFile) {
        throw new Error("Choose a file, image, screenshot, or PDF first.");
      }

      const formData = new FormData();
      formData.append("file", uploadFile);
      if (siteId) formData.append("site_id", siteId);
      if (inputLanguage) formData.append("input_language", inputLanguage);
      if (sourceChannel) formData.append("source_channel", sourceChannel);

      return createRequirementUploadBatch(formData);
    }, "Uploaded requirement batch queued for processing.");

    if (!ok) return;

    setUploadFile(null);
    await batches.refetch();
  }

  async function handleLinkSite(batchId: string, newSiteId: string) {
    await mutation.run(
      () => updateRequirementBatch(batchId, { site_id: newSiteId || null }),
      newSiteId ? "Site linked to batch successfully." : "Site unlinked from batch."
    );
    await batches.refetch();
    if (selectedBatchId === batchId) {
      await selectedBatch.refetch();
    }
  }

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Batches", value: batches.data.length },
          {
            label: "Awaiting review",
            value: batches.data.filter((batch) => batch.status === "awaiting_review").length
          },
          {
            label: "Generated",
            value: batches.data.filter((batch) => batch.status === "generated").length
          },
          {
            label: "Latest confidence",
            value:
              batches.data[0]?.overall_confidence != null
                ? `${Math.round(Number(batches.data[0].overall_confidence) * 100)}%`
                : "-"
          }
        ]}
      />

      <FormCard
        title="Universal requirement intake"
        description="Upload spreadsheets, PDFs, screenshots, photos, handwritten lists, or paste raw requirement text. The system stores the original source, extracts requirement lines asynchronously, and sends low-confidence items to review."
      >
        <form onSubmit={handleTextSubmit} className="page-stack">
          <FormGrid>
            <label>
              Site
              <select value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                <option value="">Unlinked for now</option>
                {siteOptions.data.map((site: any) => (
                  <option key={site.id} value={site.id}>
                    {site.site_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Language hint
              <select value={inputLanguage} onChange={(event) => setInputLanguage(event.target.value)}>
                <option value="mixed">Mixed Hindi + English</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </label>
          </FormGrid>

          <label>
            Source channel
            <input value={sourceChannel} onChange={(event) => setSourceChannel(event.target.value)} />
          </label>
          <FormFieldHint>
            Use this for context like `whatsapp_message`, `site_photo`, `excel_boq`, or `architect_note`.
          </FormFieldHint>

          <label>
            Pasted requirement text
            <textarea
              rows={8}
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste WhatsApp notes, BOQ fragments, mixed language requirement lines, or typed material lists here."
            />
          </label>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={mutation.isSubmitting}>
              Submit text batch
            </button>
          </div>

          <FormSectionHeader
            title="File and image upload"
            lead="Upload CSV, Excel, PDF, screenshots, handwritten lists, or site photos for asynchronous processing."
          />
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,.txt"
            onChange={(event: ChangeEvent<HTMLInputElement>) => setUploadFile(event.target.files?.[0] ?? null)}
          />
          <div className="button-row">
            <button
              className="secondary-button"
              type="button"
              onClick={() => void handleFileUpload()}
              disabled={mutation.isSubmitting}
            >
              Upload file batch
            </button>
          </div>
        </form>
        <FormNotice error={mutation.error} success={mutation.success} />
      </FormCard>

      <PageSection
        title="Recent requirement batches"
        description="These are your latest uploads and pasted requirement batches. Select a batch to inspect extracted lines and source artifacts."
      >
        <QueryState
          loading={batches.loading}
          error={batches.error}
          hasData={visibleBatches.length > 0}
          empty={{
            title: "No requirement batches yet",
            description: "Create your first batch above and the processing timeline will appear here."
          }}
        >
          <CardGrid>
            {visibleBatches.map((batch) => {
              const isProcessing = batch.status === "queued" || batch.status === "processing";
              const isFailed = batch.status === "failed";
              return (
                <DataCard
                  key={batch.id}
                  title={batch.source_channel ?? "Requirement batch"}
                  subtitle={formatRelativeDate(batch.created_at)}
                  meta={formatStatus(batch.status)}
                >
                  <p style={{ margin: "4px 0", color: isFailed ? "var(--color-danger, #ef4444)" : isProcessing ? "var(--color-warning, #f59e0b)" : undefined }}>
                    {isProcessing ? "⏳ Processing… please wait" : isFailed ? "❌ Processing failed" : `✓ ${formatStatus(batch.status)}`}
                  </p>
                  <p style={{ margin: "4px 0" }}>Review: {formatStatus(batch.review_status)}</p>
                  <p style={{ margin: "4px 0" }}>
                    Confidence:{" "}
                    {batch.overall_confidence != null
                      ? `${Math.round(Number(batch.overall_confidence) * 100)}%`
                      : "Pending"}
                  </p>
                  {siteOptions.data.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                        Linked site
                      </label>
                      <select
                        value={batch.site_id || ""}
                        onChange={(e) => void handleLinkSite(batch.id, e.target.value)}
                        disabled={mutation.isSubmitting}
                        style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid var(--border-color, #ccc)", fontSize: 13 }}
                      >
                        <option value="">-- No site linked --</option>
                        {siteOptions.data.map((site: any) => (
                          <option key={site.id} value={site.id}>{site.site_name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="button-row" style={{ marginTop: 12, display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setSelectedBatchId(batch.id)}
                      style={{ flex: 1 }}
                    >
                      Inspect batch
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{
                        borderColor: "var(--color-danger, #ef4444)",
                        color: "var(--color-danger, #ef4444)",
                        backgroundColor: "rgba(239, 68, 68, 0.05)"
                      }}
                      onClick={() => void handleDeleteBatch(batch.id)}
                    >
                      Delete
                    </button>
                  </div>
                </DataCard>
              );
            })}
          </CardGrid>
        </QueryState>
      </PageSection>

      <PageSection
        title="Selected batch detail"
        description="This shows the stored sources and the structured requirement lines extracted so far."
      >
        <QueryState
          loading={selectedBatch.loading}
          error={selectedBatch.error}
          hasData={Boolean(selectedBatch.data)}
          empty={{
            title: "No batch selected",
            description: "Pick one of the recent batches to inspect the extracted procurement lines."
          }}
        >
          <div className="page-stack">
            <CardGrid>
              {(selectedBatch.data?.sources ?? []).map((source: any) => (
                <DataCard
                  key={source.id}
                  title={source.original_filename ?? source.source_type}
                  subtitle={source.mime_type ?? source.source_type}
                  meta={formatStatus(source.source_type)}
                >
                  <p>Stored key: {source.storage_key ?? "inline text source"}</p>
                  <p>Original type: {source.source_type}</p>
                </DataCard>
              ))}
            </CardGrid>
            <RequirementItemsTable items={selectedBatch.data?.items ?? []} />
          </div>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function AdminRequirementsPage() {
  const mutation = useMutationAction();
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const batches = useRequirementBatches();
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const selectedBatch = useRequirementBatchDetail(selectedBatchId);

  const siteOptions = useRows(
    async (client) => {
      const { data, error } = await client
        .from("sites")
        .select("id, site_name")
        .order("site_name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const userOptions = useRows(
    async (client) => {
      const { data, error } = await client
        .from("users")
        .select("id, full_name, role")
        .order("full_name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const creatorName = useMemo(() => {
    const userMap = new Map((userOptions.data || []).map((u: any) => [u.id, u.full_name]));
    return (createdBy: string) => userMap.get(createdBy) || "System / System Upload";
  }, [userOptions.data]);

  async function handleLinkSite(siteId: string) {
    if (!selectedBatchId) return;

    const ok = await mutation.run(
      () => updateRequirementBatch(selectedBatchId, { site_id: siteId || null }),
      "Site linked to the requirement batch successfully."
    );

    if (!ok) return;

    await Promise.all([selectedBatch.refetch(), batches.refetch()]);
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm("Are you sure you want to delete this requirement batch? This will permanently remove it along with all parsed items.")) {
      return;
    }

    const ok = await mutation.run(
      () => deleteRequirementBatch(batchId),
      "Requirement batch deleted successfully."
    );

    if (!ok) return;

    if (selectedBatchId === batchId) {
      setSelectedBatchId(null);
    }
    await batches.refetch();
  }

  const visibleBatches = useMemo(() => {
    let filtered = batches.data;
    if (selectedCustomerId) {
      filtered = filtered.filter((batch) => batch.created_by === selectedCustomerId);
    }
    const query = search.trim().toLowerCase();
    if (!query) return filtered;
    return filtered.filter((batch) =>
      [batch.source_channel, batch.status, batch.review_status, batch.id]
        .some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [batches.data, search, selectedCustomerId]);

  const reviewItems = useMemo(
    () => (selectedBatch.data?.items ?? []).filter((item) => item.review_status === "needs_review"),
    [selectedBatch.data?.items]
  );

  const resolvedItems = useMemo(
    () => (selectedBatch.data?.items ?? []).filter((item) => item.review_status !== "needs_review"),
    [selectedBatch.data?.items]
  );

  useEffect(() => {
    if (!selectedBatchId && visibleBatches[0]?.id) {
      setSelectedBatchId(visibleBatches[0].id);
    }
  }, [selectedBatchId, visibleBatches]);

  async function updateReviewStatus(itemId: string, reviewStatus: RequirementReviewStatus) {
    if (!selectedBatchId) return;

    const ok = await mutation.run(
      () =>
        reviewRequirementBatchItem(selectedBatchId, itemId, {
          review_status: reviewStatus
        }),
      `Item marked ${formatStatus(reviewStatus)}.`
    );

    if (!ok) return;

    await Promise.all([selectedBatch.refetch(), batches.refetch()]);
  }

  async function handleGenerateProcurement() {
    if (!selectedBatchId) return;

    const ok = await mutation.run(
      () => generateRequirementProcurement(selectedBatchId, {}),
      "Procurement draft generated from the approved requirement batch."
    );

    if (!ok) return;

    await Promise.all([selectedBatch.refetch(), batches.refetch()]);
  }

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "All batches", value: batches.data.length },
          {
            label: "Needs review",
            value: batches.data.filter((batch) => batch.review_status === "needs_review").length
          },
          {
            label: "Auto matched",
            value: batches.data.filter((batch) => batch.review_status === "auto_matched").length
          },
          {
            label: "Generated",
            value: batches.data.filter((batch) => batch.status === "generated").length
          }
        ]}
      />

      <PageSection
        title="Requirement review queue"
        description="Review low-confidence requirement lines, inspect suggested candidates, and generate procurement drafts once the batch is clean."
      >
        <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary, #666)", display: "block", marginBottom: 6 }}>
              Search Queue
            </label>
            <ListSearchField
              value={search}
              onChange={setSearch}
              placeholder="Search by batch id, status, source channel, or review status"
              ariaLabel="Search requirement batches"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary, #666)" }}>
              Filter by Customer / Professional
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-color, #ccc)",
                backgroundColor: "var(--bg-card, #fff)",
                color: "var(--text-main, #333)",
                minWidth: 260,
                height: 38,
                fontSize: 14
              }}
            >
              <option value="">-- All Customers & Professionals --</option>
              {(userOptions.data || []).map((user: any) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} ({formatStatus(user.role)})
                </option>
              ))}
            </select>
          </div>
        </div>

        <QueryState
          loading={batches.loading}
          error={batches.error}
          hasData={visibleBatches.length > 0}
          empty={{
            title: "No batches available",
            description: "Once requirement batches are submitted, they will appear here for operational review."
          }}
        >
          <CardGrid>
            {visibleBatches.map((batch) => (
              <DataCard
                key={batch.id}
                title={batch.source_channel ?? batch.id}
                subtitle={`Batch ID: ${batch.id.slice(0, 8)}...`}
                meta={formatStatus(batch.status)}
              >
                <p style={{ margin: "4px 0" }}><strong>Review:</strong> {formatStatus(batch.review_status)}</p>
                <p style={{ margin: "4px 0" }}><strong>Created By:</strong> {creatorName(batch.created_by || "")}</p>
                <p style={{ margin: "4px 0" }}><strong>Date:</strong> {formatRelativeDate(batch.created_at)}</p>
                <div className="button-row" style={{ marginTop: 14, display: "flex", gap: 12 }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSelectedBatchId(batch.id)}
                    style={{ flex: 1 }}
                  >
                    Open review
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    style={{
                      borderColor: "var(--color-danger, #ef4444)",
                      color: "var(--color-danger, #ef4444)",
                      backgroundColor: "rgba(239, 68, 68, 0.05)"
                    }}
                    onClick={() => void handleDeleteBatch(batch.id)}
                  >
                    Delete
                  </button>
                </div>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>

      <PageSection
        title="Batch review detail"
        description="Approve lines, reject noisy OCR output, or leave items in review until catalog matching is corrected."
      >
        <FormNotice error={mutation.error} success={mutation.success} />
        <QueryState
          loading={selectedBatch.loading}
          error={selectedBatch.error}
          hasData={Boolean(selectedBatch.data)}
          empty={{
            title: "Choose a batch",
            description: "Select a batch from the review queue to inspect extracted items and candidate product matches."
          }}
        >
          <div className="page-stack">
            <div className="button-row" style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary, #666)" }}>
                  Link Site for Procurement
                </label>
                <select
                  value={selectedBatch.data?.site_id || ""}
                  onChange={(e) => void handleLinkSite(e.target.value)}
                  disabled={mutation.isSubmitting}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border-color, #ccc)",
                    backgroundColor: "var(--bg-card, #fff)",
                    color: "var(--text-main, #333)",
                    minWidth: 240,
                    height: 38,
                    fontSize: 14
                  }}
                >
                  <option value="">-- Select a Site --</option>
                  {(siteOptions.data || []).map((site: any) => (
                    <option key={site.id} value={site.id}>
                      {site.site_name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="primary-button"
                onClick={() => void handleGenerateProcurement()}
                disabled={mutation.isSubmitting || !selectedBatch.data?.site_id}
                title={!selectedBatch.data?.site_id ? "A site must be linked before procurement draft can be generated" : ""}
                style={{ height: 38 }}
              >
                Generate procurement draft
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {(selectedBatch.data?.sources ?? []).map((source: any) => (
                <SideBySideOcrWorkspace key={`${source.id}-side-by-side`} source={source} />
              ))}
            </div>
            <PageSection
              title="Needs review"
              description="Only the lines that still need admin action are shown here."
            >
              <QueryState
                loading={false}
                error={null}
                hasData={reviewItems.length > 0}
                empty={{
                  title: "No pending review items",
                  description: "Everything in this batch is either already approved, rejected, or auto-matched."
                }}
              >
                <CardGrid>
                  {reviewItems.map((item) => (
                    <RequirementReviewItemCard
                      key={item.id}
                      item={item}
                      onUpdateReviewStatus={updateReviewStatus}
                    />
                  ))}
                </CardGrid>
              </QueryState>
            </PageSection>

            <PageSection
              title="Resolved items"
              description="Approved, auto-matched, and rejected lines stay here for audit without cluttering the main review queue."
            >
              <QueryState
                loading={false}
                error={null}
                hasData={resolvedItems.length > 0}
                empty={{
                  title: "No resolved items yet",
                  description: "As you approve or reject lines, they will move here automatically."
                }}
              >
                <CardGrid>
                  {resolvedItems.map((item) => (
                    <RequirementReviewItemCard
                      key={item.id}
                      item={item}
                      onUpdateReviewStatus={updateReviewStatus}
                    />
                  ))}
                </CardGrid>
              </QueryState>
            </PageSection>
          </div>
        </QueryState>
      </PageSection>
    </div>
  );
}
