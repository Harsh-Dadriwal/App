"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  CardGrid,
  DataCard,
  FlowWizardSteps,
  FormCard,
  FormFieldHint,
  FormGrid,
  FormNotice,
  FormSectionHeader,
  ListSearchField,
  PageSection,
  QueryState,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { ARCH_REQUEST_STEPS, useAccessibleSites } from "./shared";
export function ArchitectProductRequestsPage() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? "";
  const sites = useAccessibleSites("architect", profileId);
  const mutation = useMutationAction();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archCreateStep, setArchCreateStep] = useState(1);
  const [requestSearch, setRequestSearch] = useState("");
  const [form, setForm] = useState({
    site_id: "",
    title: "",
    preferred_category: "",
    preferred_brand: "",
    description: ""
  });
  const requests = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_product_requests_enriched")
        .select("*")
        .eq("requested_by_user_id", profileId)
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [profileId]
  );

  const visibleArchRequests = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    if (!q) return requests.data;
    return requests.data.filter((request: any) =>
      [request.title, request.site_name, request.status, request.description, request.preferred_category, request.preferred_brand].some((value) =>
        String(value ?? "").toLowerCase().includes(q)
      )
    );
  }, [requests.data, requestSearch]);

  useEffect(() => {
    if (editingId) return;
    if (archCreateStep >= 2 && (!form.site_id || !form.title.trim())) setArchCreateStep(1);
  }, [editingId, archCreateStep, form.site_id, form.title]);

  const emptyArchRequestForm = { site_id: "", title: "", preferred_category: "", preferred_brand: "", description: "" };

  function resetArchRequestForm() {
    setEditingId(null);
    setArchCreateStep(1);
    setForm({ ...emptyArchRequestForm });
    mutation.reset();
  }

  async function saveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId && archCreateStep < 4) return;
    const client = await getSupabaseBrowserClient();
    if (!client || !profileId) return;

    const payload = {
      site_id: form.site_id,
      requested_by_user_id: profileId,
      title: form.title,
      preferred_category: form.preferred_category || null,
      preferred_brand: form.preferred_brand || null,
      description: form.description
    };

    const ok = await mutation.run(async () => {
      if (editingId) {
        return client.from("product_requests").update(payload).eq("id", editingId);
      }
      return client.from("product_requests").insert(payload);
    }, editingId ? "Request updated." : "Request sent to admin.");

    if (ok) {
      resetArchRequestForm();
      requests.refetch?.();
    }
  }

  async function deleteRequest(requestId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => client.from("product_requests").delete().eq("id", requestId),
      "Request deleted."
    );
    if (ok) {
      if (editingId === requestId) {
        resetArchRequestForm();
      }
      requests.refetch?.();
    }
  }

  const isArchWizard = !editingId;

  return (
    <div className="page-stack">
      <FormCard
        title={editingId ? "Edit custom product request" : "Request a new product"}
        description="Same category → brand → details rhythm as catalog and material lines: narrow what you need, then describe it."
      >
        <form onSubmit={saveRequest} className="auth-form">
          {isArchWizard ? <FlowWizardSteps steps={ARCH_REQUEST_STEPS} currentStep={archCreateStep} ariaLabel="Steps for product request" /> : null}
          {editingId ? <FormSectionHeader title="Request" lead={<>Edit any field, then save.</>} /> : null}

          {isArchWizard && archCreateStep === 1 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Site
                  <select value={form.site_id} onChange={(event) => setForm((state) => ({ ...state, site_id: event.target.value }))} required autoFocus>
                    <option value="">Select site</option>
                    {sites.data.map((site: any) => (
                      <option key={site.id} value={site.id}>
                        {site.site_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Request title
                  <input value={form.title} onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))} required placeholder="Short name for this need" />
                </label>
              </FormGrid>
              <div className="wizard-nav">
                <button type="button" className="primary-button" disabled={!form.site_id || !form.title.trim()} onClick={() => setArchCreateStep(2)}>
                  Continue to category
                </button>
              </div>
            </div>
          ) : null}

          {isArchWizard && archCreateStep === 2 ? (
            <div className="wizard-step-body">
              <label>
                Preferred category
                <input
                  value={form.preferred_category}
                  onChange={(event) => setForm((state) => ({ ...state, preferred_category: event.target.value }))}
                  placeholder="e.g. Cables, switches"
                  autoFocus
                />
                <FormFieldHint>Optional. Helps admin match to the catalog.</FormFieldHint>
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setArchCreateStep(1)}>
                  Back
                </button>
                <button type="button" className="primary-button" onClick={() => setArchCreateStep(3)}>
                  Continue to brand
                </button>
              </div>
            </div>
          ) : null}

          {isArchWizard && archCreateStep === 3 ? (
            <div className="wizard-step-body">
              <label>
                Preferred brand
                <input value={form.preferred_brand} onChange={(event) => setForm((state) => ({ ...state, preferred_brand: event.target.value }))} placeholder="Manufacturer or range" autoFocus />
                <FormFieldHint>Optional.</FormFieldHint>
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setArchCreateStep(2)}>
                  Back
                </button>
                <button type="button" className="primary-button" onClick={() => setArchCreateStep(4)}>
                  Continue to description
                </button>
              </div>
            </div>
          ) : null}

          {isArchWizard && archCreateStep === 4 ? (
            <div className="wizard-step-body">
              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))}
                  required
                  autoFocus
                  placeholder="Specs, quantities, finish, or links"
                />
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setArchCreateStep(3)}>
                  Back
                </button>
                <button className="primary-button" disabled={mutation.isSubmitting || !form.description.trim()} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Send request"}
                </button>
              </div>
            </div>
          ) : null}

          {editingId ? (
            <>
              <FormGrid>
                <label>
                  Site
                  <select value={form.site_id} onChange={(event) => setForm((state) => ({ ...state, site_id: event.target.value }))} required>
                    <option value="">Select site</option>
                    {sites.data.map((site: any) => (
                      <option key={site.id} value={site.id}>
                        {site.site_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Request title
                  <input value={form.title} onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))} required />
                </label>
                <label>
                  Preferred category
                  <input value={form.preferred_category} onChange={(event) => setForm((state) => ({ ...state, preferred_category: event.target.value }))} />
                </label>
                <label>
                  Preferred brand
                  <input value={form.preferred_brand} onChange={(event) => setForm((state) => ({ ...state, preferred_brand: event.target.value }))} />
                </label>
              </FormGrid>
              <label>
                Description
                <textarea value={form.description} onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))} required />
              </label>
              <div className="form-actions">
                <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Update request"}
                </button>
                <button type="button" className="secondary-button" onClick={resetArchRequestForm}>
                  Cancel edit
                </button>
              </div>
            </>
          ) : null}
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>

      <PageSection title="Your requests" description="Search your queue. Track match, order, and fulfillment status.">
        <QueryState
          loading={requests.loading}
          error={requests.error}
          hasData={requests.data.length > 0}
          empty={{ title: "No product requests yet", description: "Custom requests you send from here will appear in this queue." }}
        >
          <ListSearchField value={requestSearch} onChange={setRequestSearch} placeholder="Search requests" ariaLabel="Search product requests" />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleArchRequests.length > 0}
            empty={{ title: "No matching requests", description: "Try another search or clear the filter." }}
          >
            <CardGrid>
              {visibleArchRequests.map((request: any) => (
                <DataCard key={request.id} title={request.title} subtitle={request.site_name} meta={request.status}>
                  <p>{request.description}</p>
                  <p>Preferred category: {request.preferred_category ?? "-"}</p>
                  <p>Preferred brand: {request.preferred_brand ?? "-"}</p>
                  <p>Matched product: {request.matched_product_name ?? "-"}</p>
                  <p>Admin notes: {request.admin_notes ?? "-"}</p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingId(request.id);
                        setArchCreateStep(1);
                        setForm({
                          site_id: request.site_id ?? "",
                          title: request.title ?? "",
                          preferred_category: request.preferred_category ?? "",
                          preferred_brand: request.preferred_brand ?? "",
                          description: request.description ?? ""
                        });
                        mutation.reset();
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void deleteRequest(request.id)}
                      disabled={mutation.isSubmitting}
                    >
                      Delete
                    </button>
                  </div>
                </DataCard>
              ))}
            </CardGrid>
          </QueryState>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function AdminProductRequestsPage() {
  const mutation = useMutationAction();
  const products = useRows(
    async (client) => {
      const { data, error } = await client
        .from("products")
        .select("id, item_name, sku")
        .order("item_name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const requests = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_product_requests_enriched")
        .select("*")
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adminReqSearch, setAdminReqSearch] = useState("");
  const [form, setForm] = useState({
    status: "reviewing",
    matched_product_id: "",
    admin_notes: ""
  });

  const visibleAdminRequests = useMemo(() => {
    const q = adminReqSearch.trim().toLowerCase();
    if (!q) return requests.data;
    return requests.data.filter((request: any) =>
      [request.title, request.site_name, request.requested_by_name, request.status, request.description].some((value) =>
        String(value ?? "").toLowerCase().includes(q)
      )
    );
  }, [requests.data, adminReqSearch]);

  async function saveResolution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client || !editingId) return;

    const payload = {
      status: form.status,
      matched_product_id: form.matched_product_id || null,
      admin_notes: form.admin_notes || null,
      ordered_at: form.status === "ordered" ? new Date().toISOString() : null,
      fulfilled_at: form.status === "fulfilled" ? new Date().toISOString() : null
    };

    const ok = await mutation.run(
      async () => client.from("product_requests").update(payload).eq("id", editingId),
      "Product request updated."
    );

    if (ok) {
      setEditingId(null);
      setForm({ status: "reviewing", matched_product_id: "", admin_notes: "" });
      requests.refetch?.();
    }
  }

  async function deleteRequest(requestId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => client.from("product_requests").delete().eq("id", requestId),
      "Request deleted."
    );
    if (ok) {
      if (editingId === requestId) {
        setEditingId(null);
        setForm({ status: "reviewing", matched_product_id: "", admin_notes: "" });
      }
      requests.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <FormCard
        title="Resolve architect product requests"
        description="Pick a row in the queue below, then set status, optional catalog match, and notes—same toolbar and card pattern as other admin lists."
      >
        <form onSubmit={saveResolution} className="auth-form">
          {!editingId ? (
            <FormSectionHeader title="Resolution form" lead={<>Choose <strong>Resolve</strong> on a request in the queue to load it here.</>} />
          ) : null}
          <FormGrid>
            <label>
              Status
              <select value={form.status} onChange={(event) => setForm((state) => ({ ...state, status: event.target.value }))} disabled={!editingId}>
                <option value="reviewing">Reviewing</option>
                <option value="matched">Matched</option>
                <option value="ordered">Ordered</option>
                <option value="fulfilled">Fulfilled</option>
                <option value="rejected">Rejected</option>
              </select>
              {!editingId ? <FormFieldHint>Enabled after you select a request.</FormFieldHint> : null}
            </label>
            <label>
              Matched product
              <select
                value={form.matched_product_id}
                onChange={(event) => setForm((state) => ({ ...state, matched_product_id: event.target.value }))}
                disabled={!editingId}
              >
                <option value="">Select product</option>
                {products.data.map((product: any) => (
                  <option key={product.id} value={product.id}>
                    {product.item_name} {product.sku ? `(${product.sku})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </FormGrid>
          <label>
            Admin notes
            <textarea value={form.admin_notes} onChange={(event) => setForm((state) => ({ ...state, admin_notes: event.target.value }))} disabled={!editingId} />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={mutation.isSubmitting || !editingId}>
              {mutation.isSubmitting ? "Saving..." : "Save resolution"}
            </button>
            {editingId ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditingId(null);
                  setForm({ status: "reviewing", matched_product_id: "", admin_notes: "" });
                  mutation.reset();
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>

      <PageSection title="Request queue" description="Search by title, site, architect, or status.">
        <QueryState
          loading={requests.loading}
          error={requests.error}
          hasData={requests.data.length > 0}
          empty={{ title: "No requests yet", description: "Architect custom product requests will appear here." }}
        >
          <ListSearchField value={adminReqSearch} onChange={setAdminReqSearch} placeholder="Search the queue" ariaLabel="Search product requests" />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleAdminRequests.length > 0}
            empty={{ title: "No matching requests", description: "Try another search or clear the filter." }}
          >
            <CardGrid>
              {visibleAdminRequests.map((request: any) => (
                <DataCard key={request.id} title={request.title} subtitle={`${request.site_name} · ${request.requested_by_name}`} meta={request.status}>
                  <p>{request.description}</p>
                  <p>Preferred category: {request.preferred_category ?? "-"}</p>
                  <p>Preferred brand: {request.preferred_brand ?? "-"}</p>
                  <p>Matched: {request.matched_product_name ?? "-"}</p>
                  <p>Admin notes: {request.admin_notes ?? "-"}</p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingId(request.id);
                        setForm({
                          status: request.status ?? "reviewing",
                          matched_product_id: request.matched_product_id ?? "",
                          admin_notes: request.admin_notes ?? ""
                        });
                        mutation.reset();
                      }}
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void deleteRequest(request.id)}
                      disabled={mutation.isSubmitting}
                    >
                      Delete
                    </button>
                  </div>
                </DataCard>
              ))}
            </CardGrid>
          </QueryState>
        </QueryState>
      </PageSection>
    </div>
  );
}

