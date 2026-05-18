"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import type {
  RequirementBatch,
  RequirementBatchItem,
  RequirementBatchItemCandidate,
  RequirementReviewStatus
} from "@mahalaxmi/core/types/domain";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
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
            {visibleBatches.map((batch) => (
              <DataCard
                key={batch.id}
                title={batch.source_channel ?? "Requirement batch"}
                subtitle={formatRelativeDate(batch.created_at)}
                meta={formatStatus(batch.status)}
              >
                <p>Review: {formatStatus(batch.review_status)}</p>
                <p>
                  Confidence:{" "}
                  {batch.overall_confidence != null
                    ? `${Math.round(Number(batch.overall_confidence) * 100)}%`
                    : "Pending"}
                </p>
                <div className="button-row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    Inspect batch
                  </button>
                </div>
              </DataCard>
            ))}
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

  async function handleLinkSite(siteId: string) {
    if (!selectedBatchId) return;

    const ok = await mutation.run(
      () => updateRequirementBatch(selectedBatchId, { site_id: siteId || null }),
      "Site linked to the requirement batch successfully."
    );

    if (!ok) return;

    await Promise.all([selectedBatch.refetch(), batches.refetch()]);
  }

  const visibleBatches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return batches.data;
    return batches.data.filter((batch) =>
      [batch.source_channel, batch.status, batch.review_status, batch.id]
        .some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [batches.data, search]);

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
        <ListSearchField
          value={search}
          onChange={setSearch}
          placeholder="Search by batch id, status, source channel, or review status"
          ariaLabel="Search requirement batches"
        />
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
                subtitle={batch.id}
                meta={formatStatus(batch.status)}
              >
                <p>Review: {formatStatus(batch.review_status)}</p>
                <p>Created: {formatRelativeDate(batch.created_at)}</p>
                <div className="button-row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setSelectedBatchId(batch.id)}
                  >
                    Open review
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
            <CardGrid>
              {(selectedBatch.data?.items ?? []).map((item) => (
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
                  <p>
                    Extraction confidence:{" "}
                    {item.extraction_confidence != null
                      ? `${Math.round(Number(item.extraction_confidence) * 100)}%`
                      : "-"}
                  </p>
                  <p>
                    Match confidence:{" "}
                    {item.match_confidence != null
                      ? `${Math.round(Number(item.match_confidence) * 100)}%`
                      : "-"}
                  </p>
                  {(item.candidates ?? []).length ? (
                    <div style={{ marginTop: 10 }}>
                      <strong>Top candidates</strong>
                      <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                        {(item.candidates ?? []).map((candidate) => (
                          <li key={candidate.id}>
                            {candidate.candidate_product_id} · {Math.round(Number(candidate.final_score ?? 0) * 100)}%
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="button-row" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void updateReviewStatus(item.id, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void updateReviewStatus(item.id, "needs_review")}
                    >
                      Keep in review
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void updateReviewStatus(item.id, "rejected")}
                    >
                      Reject
                    </button>
                  </div>
                </DataCard>
              ))}
            </CardGrid>
          </div>
        </QueryState>
      </PageSection>
    </div>
  );
}
