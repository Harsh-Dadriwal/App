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
import type { AppRole } from "@/lib/app-types";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const NOTE_STEPS = [
  { label: "Where & who", description: "Site and recipient" },
  { label: "Message", description: "Note text" }
] as const;

const ARCH_REQUEST_STEPS = [
  { label: "Site & title", description: "What you need" },
  { label: "Category", description: "Preferred group" },
  { label: "Brand", description: "Preferred line" },
  { label: "Details", description: "Description and send" }
] as const;

const ADMIN_ASSIGN_STEPS = [
  { label: "Site", description: "Which project" },
  { label: "Who", description: "Role and person" },
  { label: "Status", description: "Save assignment" }
] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function ModalShell({
  title,
  description,
  onClose,
  children
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div className="section-title">
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function useAccessibleSites(role: AppRole, profileId: string) {
  return useRows(
    async (client) => {
      if (!profileId && role !== "admin") {
        return { data: [] as any[], error: null };
      }

      if (role === "customer") {
        const { data, error } = await client
          .from("sites")
          .select("id, site_name, site_code")
          .eq("customer_id", profileId)
          .order("site_name");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      if (role === "electrician") {
        const { data, error } = await client
          .from("vw_electrician_ongoing_projects")
          .select("site_id, site_name, site_code")
          .eq("electrician_id", profileId)
          .order("site_name");
        return {
          data: (data ?? []).map((item: any) => ({ id: item.site_id, site_name: item.site_name, site_code: item.site_code })) as any[],
          error: error?.message ?? null
        };
      }

      if (role === "architect") {
        const { data, error } = await client
          .from("vw_architect_ongoing_projects")
          .select("site_id, site_name, site_code")
          .eq("architect_id", profileId)
          .order("site_name");
        return {
          data: (data ?? []).map((item: any) => ({ id: item.site_id, site_name: item.site_name, site_code: item.site_code })) as any[],
          error: error?.message ?? null
        };
      }

      const { data, error } = await client
        .from("sites")
        .select("id, site_name, site_code")
        .order("site_name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [role, profileId]
  );
}

function getRecipientOptions(role: AppRole) {
  if (role === "customer") {
    return [
      { value: "electrician", label: "Electrician" },
      { value: "architect", label: "Architect" },
      { value: "admin", label: "Admin" }
    ];
  }

  if (role === "electrician") {
    return [
      { value: "customer", label: "Customer" },
      { value: "architect", label: "Architect" },
      { value: "admin", label: "Admin" }
    ];
  }

  if (role === "architect") {
    return [
      { value: "customer", label: "Customer" },
      { value: "electrician", label: "Electrician" },
      { value: "admin", label: "Admin" }
    ];
  }

  return [
    { value: "customer", label: "Customer" },
    { value: "electrician", label: "Electrician" },
    { value: "architect", label: "Architect" },
    { value: "admin", label: "Admin" }
  ];
}

export function ProjectNotesPage({ role }: { role: AppRole }) {
  const { profile } = useAuth();
  const profileId = profile?.id ?? "";
  const sites = useAccessibleSites(role, profileId);
  const notes = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_site_notes_enriched")
        .select("*")
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [role, profileId]
  );
  const mutation = useMutationAction();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteCreateStep, setNoteCreateStep] = useState(1);
  const [noteSearch, setNoteSearch] = useState("");
  const [form, setForm] = useState({
    site_id: "",
    recipient_role: role === "admin" ? "customer" : "admin",
    note_text: ""
  });

  const defaultRecipient = role === "admin" ? "customer" : "admin";

  const visibleNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    if (!q) return notes.data;
    return notes.data.filter((note: any) =>
      [note.site_name, note.note_text, note.sender_name, note.recipient_role].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [notes.data, noteSearch]);

  useEffect(() => {
    if (editingId) return;
    if (noteCreateStep >= 2 && !form.site_id) setNoteCreateStep(1);
  }, [editingId, noteCreateStep, form.site_id]);

  function resetNoteForm() {
    setEditingId(null);
    setNoteCreateStep(1);
    setForm({ site_id: "", recipient_role: defaultRecipient, note_text: "" });
    mutation.reset();
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId && noteCreateStep < 2) return;
    const client = await getSupabaseBrowserClient();
    if (!client || !profileId) return;

    const payload = {
      site_id: form.site_id,
      sender_user_id: profileId,
      recipient_role: form.recipient_role || null,
      note_text: form.note_text
    };

    const ok = await mutation.run(async () => {
      if (editingId) {
        return client.from("site_notes").update(payload).eq("id", editingId);
      }
      return client.from("site_notes").insert(payload);
    }, editingId ? "Note updated." : "Note sent.");

    if (ok) {
      resetNoteForm();
      notes.refetch?.();
    }
  }

  async function deleteNote(noteId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => client.from("site_notes").delete().eq("id", noteId),
      "Note deleted."
    );
    if (ok) {
      if (editingId === noteId) {
        resetNoteForm();
      }
      notes.refetch?.();
    }
  }

  const isNoteWizard = !editingId;

  return (
    <div className="page-stack">
      <FormCard
        title={editingId ? "Edit note" : "Send a project note"}
        description="Same guided layout on every role: choose the site and audience, then write the note."
      >
        <form onSubmit={saveNote} className="auth-form">
          {isNoteWizard ? <FlowWizardSteps steps={NOTE_STEPS} currentStep={noteCreateStep} ariaLabel="Steps to send a note" /> : null}
          {editingId ? <FormSectionHeader title="Note" lead={<>Update the message or routing, then save.</>} /> : null}

          {isNoteWizard && noteCreateStep === 1 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Site
                  <select value={form.site_id} onChange={(event) => setForm((state) => ({ ...state, site_id: event.target.value }))} required autoFocus>
                    <option value="">Select site</option>
                    {sites.data.map((site: any) => (
                      <option key={site.id} value={site.id}>
                        {site.site_name} {site.site_code ? `(${site.site_code})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Send to
                  <select value={form.recipient_role} onChange={(event) => setForm((state) => ({ ...state, recipient_role: event.target.value }))}>
                    {getRecipientOptions(role).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FormFieldHint>Only roles you are allowed to message appear here.</FormFieldHint>
                </label>
              </FormGrid>
              <div className="wizard-nav">
                <button type="button" className="primary-button" disabled={!form.site_id} onClick={() => setNoteCreateStep(2)}>
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {isNoteWizard && noteCreateStep === 2 ? (
            <div className="wizard-step-body">
              <label>
                Note
                <textarea
                  value={form.note_text}
                  onChange={(event) => setForm((state) => ({ ...state, note_text: event.target.value }))}
                  required
                  autoFocus
                  placeholder="Your message to the project team"
                />
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setNoteCreateStep(1)}>
                  Back
                </button>
                <button className="primary-button" disabled={mutation.isSubmitting || !form.note_text.trim()} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Send note"}
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
                        {site.site_name} {site.site_code ? `(${site.site_code})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Send to
                  <select value={form.recipient_role} onChange={(event) => setForm((state) => ({ ...state, recipient_role: event.target.value }))}>
                    {getRecipientOptions(role).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </FormGrid>
              <label>
                Note
                <textarea value={form.note_text} onChange={(event) => setForm((state) => ({ ...state, note_text: event.target.value }))} required />
              </label>
              <div className="form-actions">
                <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Update note"}
                </button>
                <button type="button" className="secondary-button" onClick={resetNoteForm}>
                  Cancel edit
                </button>
              </div>
            </>
          ) : null}
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>

      <PageSection title="Notes feed" description="Search the thread. Same card layout for customer, electrician, architect, and admin.">
        <QueryState
          loading={notes.loading}
          error={notes.error}
          hasData={notes.data.length > 0}
          empty={{ title: "No notes yet", description: "Send your first site note to start collaboration inside the app." }}
        >
          <ListSearchField value={noteSearch} onChange={setNoteSearch} placeholder="Search notes" ariaLabel="Search notes" />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleNotes.length > 0}
            empty={{ title: "No matching notes", description: "Try different words or clear the search." }}
          >
            <CardGrid>
              {visibleNotes.map((note: any) => (
                <DataCard
                  key={note.id}
                  title={note.site_name}
                  subtitle={`${note.sender_name} (${note.sender_role})`}
                  meta={note.recipient_name ?? note.recipient_role ?? "All participants"}
                >
                  <p>{note.note_text}</p>
                  <p>{new Date(note.created_at).toLocaleString("en-IN")}</p>
                  {note.sender_user_id === profileId || role === "admin" ? (
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditingId(note.id);
                          setNoteCreateStep(1);
                          setForm({
                            site_id: note.site_id ?? "",
                            recipient_role: note.recipient_role ?? defaultRecipient,
                            note_text: note.note_text ?? ""
                          });
                          mutation.reset();
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void deleteNote(note.id)}
                        disabled={mutation.isSubmitting}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </DataCard>
              ))}
            </CardGrid>
          </QueryState>
        </QueryState>
      </PageSection>
    </div>
  );
}

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

export function AdminCatalogPage() {
  const categoryMutation = useMutationAction();
  const brandMutation = useMutationAction();
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isBrandModalOpen, setIsBrandModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [categorySlugTouched, setCategorySlugTouched] = useState(false);
  const [brandSlugTouched, setBrandSlugTouched] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: "", slug: "", sort_order: "0" });
  const [brandForm, setBrandForm] = useState({ category_id: "", name: "", slug: "", sort_order: "0" });

  const categories = useRows(async (client) => {
    const { data, error } = await client
      .from("product_categories")
      .select("id, name, slug, sort_order")
      .order("sort_order")
      .order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const brands = useRows(async (client) => {
    const { data, error } = await client
      .from("product_brands")
      .select("id, category_id, name, slug, sort_order")
      .order("sort_order")
      .order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const products = useRows(async (client) => {
    const { data, error } = await client.from("products").select("id, category_id, brand_id");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const categoryLookup = useMemo(
    () => new Map(categories.data.map((category: any) => [category.id, category.name])),
    [categories.data]
  );
  const brandCounts = useMemo(() => {
    const counts = new Map<string, number>();
    brands.data.forEach((brand: any) => {
      counts.set(brand.category_id, (counts.get(brand.category_id) ?? 0) + 1);
    });
    return counts;
  }, [brands.data]);
  const productCountsByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    products.data.forEach((product: any) => {
      counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1);
    });
    return counts;
  }, [products.data]);
  const productCountsByBrand = useMemo(() => {
    const counts = new Map<string, number>();
    products.data.forEach((product: any) => {
      counts.set(product.brand_id, (counts.get(product.brand_id) ?? 0) + 1);
    });
    return counts;
  }, [products.data]);
  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    if (!query) return categories.data;
    return categories.data.filter((category: any) =>
      [category.name, category.slug].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [categories.data, categorySearch]);
  const filteredBrands = useMemo(() => {
    const query = brandSearch.trim().toLowerCase();
    if (!query) return brands.data;
    return brands.data.filter((brand: any) =>
      [brand.name, brand.slug, categoryLookup.get(brand.category_id)]
        .some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [brands.data, brandSearch, categoryLookup]);

  function closeCategoryModal() {
    setEditingCategoryId(null);
    setCategorySlugTouched(false);
    setCategoryForm({ name: "", slug: "", sort_order: "0" });
    categoryMutation.reset();
    setIsCategoryModalOpen(false);
  }

  function closeBrandModal() {
    setEditingBrandId(null);
    setBrandSlugTouched(false);
    setBrandForm({ category_id: "", name: "", slug: "", sort_order: "0" });
    brandMutation.reset();
    setIsBrandModalOpen(false);
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const payload = {
      name: categoryForm.name,
      slug: categoryForm.slug,
      sort_order: Number(categoryForm.sort_order || 0)
    };
    const ok = await categoryMutation.run(async () => {
      if (editingCategoryId) {
        return client.from("product_categories").update(payload).eq("id", editingCategoryId);
      }
      return client.from("product_categories").insert(payload);
    }, editingCategoryId ? "Category updated." : "Category created.");
    if (ok) {
      closeCategoryModal();
      categories.refetch?.();
    }
  }

  async function deleteCategory(categoryId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    if ((brandCounts.get(categoryId) ?? 0) > 0 || (productCountsByCategory.get(categoryId) ?? 0) > 0) {
      await categoryMutation.run(
        async () => ({
          error: {
            message: "This category cannot be deleted because brands or products are still linked to it."
          }
        }),
        undefined
      );
      return;
    }
    const ok = await categoryMutation.run(
      async () => client.from("product_categories").delete().eq("id", categoryId),
      "Category deleted."
    );
    if (ok) {
      if (editingCategoryId === categoryId) closeCategoryModal();
      categories.refetch?.();
    }
  }

  async function saveBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const payload = {
      category_id: brandForm.category_id,
      name: brandForm.name,
      slug: brandForm.slug,
      sort_order: Number(brandForm.sort_order || 0)
    };
    const ok = await brandMutation.run(async () => {
      if (editingBrandId) {
        return client.from("product_brands").update(payload).eq("id", editingBrandId);
      }
      return client.from("product_brands").insert(payload);
    }, editingBrandId ? "Brand updated." : "Brand created.");
    if (ok) {
      closeBrandModal();
      brands.refetch?.();
    }
  }

  async function deleteBrand(brandId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    if ((productCountsByBrand.get(brandId) ?? 0) > 0) {
      await brandMutation.run(
        async () => ({
          error: {
            message: "This brand cannot be deleted because products are still linked to it."
          }
        }),
        undefined
      );
      return;
    }
    const ok = await brandMutation.run(
      async () => client.from("product_brands").delete().eq("id", brandId),
      "Brand deleted."
    );
    if (ok) {
      if (editingBrandId === brandId) closeBrandModal();
      brands.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <PageSection title="Catalog controls" description="Launch quick forms, search the hierarchy, and keep categories and brands clean before products are added.">
        <div className="catalog-toolbar">
          <div className="catalog-toolbar-actions">
            <button type="button" className="primary-button" onClick={() => setIsCategoryModalOpen(true)}>
              New category
            </button>
            <button type="button" className="primary-button" onClick={() => setIsBrandModalOpen(true)}>
              New brand
            </button>
          </div>
          <div className="catalog-toolbar-stats">
            <span className="badge">Categories {categories.data.length}</span>
            <span className="badge">Brands {brands.data.length}</span>
            <span className="badge">Products {products.data.length}</span>
          </div>
        </div>
      </PageSection>

      {isCategoryModalOpen ? (
        <ModalShell
          title={editingCategoryId ? "Edit category" : "Create category"}
          description="Maintain the first level of the product catalog directly from the admin app."
          onClose={closeCategoryModal}
        >
          <form onSubmit={saveCategory} className="auth-form">
            <FormGrid>
              <label>
                Name
                <input
                  value={categoryForm.name}
                  onChange={(event) =>
                    setCategoryForm((state) => ({
                      ...state,
                      name: event.target.value,
                      slug: categorySlugTouched ? state.slug : slugify(event.target.value)
                    }))
                  }
                  required
                />
              </label>
              <label>
                Slug
                <input
                  value={categoryForm.slug}
                  onChange={(event) => {
                    setCategorySlugTouched(true);
                    setCategoryForm((state) => ({ ...state, slug: slugify(event.target.value) }));
                  }}
                  required
                />
              </label>
              <label>
                Sort order
                <input type="number" value={categoryForm.sort_order} onChange={(event) => setCategoryForm((state) => ({ ...state, sort_order: event.target.value }))} />
              </label>
            </FormGrid>
            <div className="form-actions">
              <button className="primary-button" disabled={categoryMutation.isSubmitting}>
                {categoryMutation.isSubmitting ? "Saving..." : editingCategoryId ? "Update category" : "Create category"}
              </button>
              <button type="button" className="secondary-button" onClick={closeCategoryModal}>
                Cancel
              </button>
            </div>
            <FormNotice error={categoryMutation.error} success={categoryMutation.success} />
          </form>
        </ModalShell>
      ) : null}

      {isBrandModalOpen ? (
        <ModalShell
          title={editingBrandId ? "Edit brand" : "Create brand"}
          description="Maintain the second level of the product catalog and link brands to categories."
          onClose={closeBrandModal}
        >
          <form onSubmit={saveBrand} className="auth-form">
            <FormGrid>
              <label>
                Category
                <select value={brandForm.category_id} onChange={(event) => setBrandForm((state) => ({ ...state, category_id: event.target.value }))} required>
                  <option value="">Select category</option>
                  {categories.data.map((category: any) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Name
                <input
                  value={brandForm.name}
                  onChange={(event) =>
                    setBrandForm((state) => ({
                      ...state,
                      name: event.target.value,
                      slug: brandSlugTouched ? state.slug : slugify(event.target.value)
                    }))
                  }
                  required
                />
              </label>
              <label>
                Slug
                <input
                  value={brandForm.slug}
                  onChange={(event) => {
                    setBrandSlugTouched(true);
                    setBrandForm((state) => ({ ...state, slug: slugify(event.target.value) }));
                  }}
                  required
                />
              </label>
              <label>
                Sort order
                <input type="number" value={brandForm.sort_order} onChange={(event) => setBrandForm((state) => ({ ...state, sort_order: event.target.value }))} />
              </label>
            </FormGrid>
            <div className="form-actions">
              <button className="primary-button" disabled={brandMutation.isSubmitting}>
                {brandMutation.isSubmitting ? "Saving..." : editingBrandId ? "Update brand" : "Create brand"}
              </button>
              <button type="button" className="secondary-button" onClick={closeBrandModal}>
                Cancel
              </button>
            </div>
            <FormNotice error={brandMutation.error} success={brandMutation.success} />
          </form>
        </ModalShell>
      ) : null}

      <PageSection title="Categories" description="These are the top-level catalog buckets used throughout the app.">
        <div className="catalog-search-row">
          <input className="catalog-search-input" placeholder="Search categories by name or slug" value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} />
        </div>
        <FormNotice error={categoryMutation.error} success={categoryMutation.success} />
        <QueryState
          loading={categories.loading}
          error={categories.error}
          hasData={filteredCategories.length > 0}
          empty={{ title: "No categories yet", description: "Create categories here to start building the catalog hierarchy." }}
        >
          <CardGrid>
            {filteredCategories.map((category: any) => (
              <DataCard key={category.id} title={category.name} subtitle={category.slug} meta={`Sort ${category.sort_order ?? 0}`}>
                <p>Brands linked: {brandCounts.get(category.id) ?? 0} · Products linked: {productCountsByCategory.get(category.id) ?? 0}</p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingCategoryId(category.id);
                      setCategorySlugTouched(false);
                      setCategoryForm({
                        name: category.name ?? "",
                        slug: category.slug ?? "",
                        sort_order: String(category.sort_order ?? 0)
                      });
                      categoryMutation.reset();
                      setIsCategoryModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void deleteCategory(category.id)} disabled={categoryMutation.isSubmitting}>
                    Delete
                  </button>
                </div>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>

      <PageSection title="Brands" description="Brands are linked to categories and become the second tier of the catalog.">
        <div className="catalog-search-row">
          <input className="catalog-search-input" placeholder="Search brands by name, slug, or category" value={brandSearch} onChange={(event) => setBrandSearch(event.target.value)} />
        </div>
        <FormNotice error={brandMutation.error} success={brandMutation.success} />
        <QueryState
          loading={brands.loading}
          error={brands.error}
          hasData={filteredBrands.length > 0}
          empty={{ title: "No brands yet", description: "Create brands here after your categories are ready." }}
        >
          <CardGrid>
            {filteredBrands.map((brand: any) => (
              <DataCard key={brand.id} title={brand.name} subtitle={categoryLookup.get(brand.category_id) ?? "Unlinked category"} meta={`Sort ${brand.sort_order ?? 0}`}>
                <p>{brand.slug}</p>
                <p>Products linked: {productCountsByBrand.get(brand.id) ?? 0}</p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingBrandId(brand.id);
                      setBrandSlugTouched(false);
                      setBrandForm({
                        category_id: brand.category_id ?? "",
                        name: brand.name ?? "",
                        slug: brand.slug ?? "",
                        sort_order: String(brand.sort_order ?? 0)
                      });
                      brandMutation.reset();
                      setIsBrandModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void deleteBrand(brand.id)} disabled={brandMutation.isSubmitting}>
                    Delete
                  </button>
                </div>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function AdminAssignmentsPage() {
  const mutation = useMutationAction();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assignCreateStep, setAssignCreateStep] = useState(1);
  const [assignSearch, setAssignSearch] = useState("");
  const [form, setForm] = useState({
    site_id: "",
    user_id: "",
    role: "electrician",
    status: "active"
  });
  const sites = useRows(async (client) => {
    const { data, error } = await client.from("sites").select("id, site_name, site_code").order("site_name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const users = useRows(async (client) => {
    const { data, error } = await client
      .from("users")
      .select("id, full_name, role, verification_status, is_admin_verified")
      .in("role", ["electrician", "architect"])
      .order("full_name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const assignments = useRows(async (client) => {
    const { data, error } = await client
      .from("site_assignments")
      .select("id, site_id, user_id, role, status, assigned_at")
      .order("assigned_at", { ascending: false });
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);

  const siteLookup = useMemo(() => new Map(sites.data.map((site: any) => [site.id, site])), [sites.data]);
  const userLookup = useMemo(() => new Map(users.data.map((user: any) => [user.id, user])), [users.data]);
  const availableUsers = useMemo(
    () => users.data.filter((user: any) => user.role === form.role && user.is_admin_verified),
    [users.data, form.role]
  );

  const visibleAssignments = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return assignments.data;
    return assignments.data.filter((assignment: any) => {
      const site = siteLookup.get(assignment.site_id);
      const user = userLookup.get(assignment.user_id);
      return [site?.site_name, site?.site_code, user?.full_name, assignment.role, assignment.status].some((value) =>
        String(value ?? "").toLowerCase().includes(q)
      );
    });
  }, [assignments.data, assignSearch, siteLookup, userLookup]);

  useEffect(() => {
    if (editingId) return;
    if (assignCreateStep >= 2 && !form.site_id) setAssignCreateStep(1);
    else if (assignCreateStep >= 3 && !form.user_id) setAssignCreateStep(2);
  }, [editingId, assignCreateStep, form.site_id, form.user_id]);

  const emptyAssignForm = { site_id: "", user_id: "", role: "electrician" as const, status: "active" as const };

  function resetAssignmentForm() {
    setEditingId(null);
    setAssignCreateStep(1);
    setForm({ ...emptyAssignForm });
    mutation.reset();
  }

  async function saveAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId && assignCreateStep < 3) return;
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const payload = {
      site_id: form.site_id,
      user_id: form.user_id,
      role: form.role,
      status: form.status
    };
    const ok = await mutation.run(async () => {
      if (editingId) {
        return client.from("site_assignments").update(payload).eq("id", editingId);
      }
      return client.from("site_assignments").insert(payload);
    }, editingId ? "Assignment updated." : "Assignment created.");
    if (ok) {
      resetAssignmentForm();
      assignments.refetch?.();
    }
  }

  async function deleteAssignment(assignmentId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => client.from("site_assignments").delete().eq("id", assignmentId),
      "Assignment deleted."
    );
    if (ok) {
      if (editingId === assignmentId) {
        resetAssignmentForm();
      }
      assignments.refetch?.();
    }
  }

  const isAssignWizard = !editingId;

  return (
    <div className="page-stack">
      <FormCard
        title={editingId ? "Edit site assignment" : "Assign electrician or architect"}
        description="Site first, then role and verified professional, then status—consistent with other multi-step admin forms."
      >
        <form onSubmit={saveAssignment} className="auth-form">
          {isAssignWizard ? <FlowWizardSteps steps={ADMIN_ASSIGN_STEPS} currentStep={assignCreateStep} ariaLabel="Steps to create assignment" /> : null}
          {editingId ? <FormSectionHeader title="Assignment" lead={<>Update fields, then save.</>} /> : null}

          {isAssignWizard && assignCreateStep === 1 ? (
            <div className="wizard-step-body">
              <label>
                Site
                <select value={form.site_id} onChange={(event) => setForm((state) => ({ ...state, site_id: event.target.value }))} required autoFocus>
                  <option value="">Select site</option>
                  {sites.data.map((site: any) => (
                    <option key={site.id} value={site.id}>
                      {site.site_name} {site.site_code ? `(${site.site_code})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="wizard-nav">
                <button type="button" className="primary-button" disabled={!form.site_id} onClick={() => setAssignCreateStep(2)}>
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {isAssignWizard && assignCreateStep === 2 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Role
                  <select value={form.role} onChange={(event) => setForm((state) => ({ ...state, role: event.target.value, user_id: "" }))} autoFocus>
                    <option value="electrician">Electrician</option>
                    <option value="architect">Architect</option>
                  </select>
                </label>
                <label>
                  Professional
                  <select value={form.user_id} onChange={(event) => setForm((state) => ({ ...state, user_id: event.target.value }))} required>
                    <option value="">Select professional</option>
                    {availableUsers.map((user: any) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name}
                      </option>
                    ))}
                  </select>
                  <FormFieldHint>Only admin-verified users for the selected role.</FormFieldHint>
                </label>
              </FormGrid>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setAssignCreateStep(1)}>
                  Back
                </button>
                <button type="button" className="primary-button" disabled={!form.user_id} onClick={() => setAssignCreateStep(3)}>
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {isAssignWizard && assignCreateStep === 3 ? (
            <div className="wizard-step-body">
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm((state) => ({ ...state, status: event.target.value }))} autoFocus>
                  <option value="active">Active</option>
                  <option value="removed">Removed</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setAssignCreateStep(2)}>
                  Back
                </button>
                <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Create assignment"}
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
                        {site.site_name} {site.site_code ? `(${site.site_code})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Role
                  <select value={form.role} onChange={(event) => setForm((state) => ({ ...state, role: event.target.value, user_id: "" }))}>
                    <option value="electrician">Electrician</option>
                    <option value="architect">Architect</option>
                  </select>
                </label>
                <label>
                  Professional
                  <select value={form.user_id} onChange={(event) => setForm((state) => ({ ...state, user_id: event.target.value }))} required>
                    <option value="">Select professional</option>
                    {availableUsers.map((user: any) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name} {user.is_admin_verified ? "" : "(Pending verification)"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={form.status} onChange={(event) => setForm((state) => ({ ...state, status: event.target.value }))}>
                    <option value="active">Active</option>
                    <option value="removed">Removed</option>
                    <option value="completed">Completed</option>
                  </select>
                </label>
              </FormGrid>
              <div className="form-actions">
                <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Update assignment"}
                </button>
                <button type="button" className="secondary-button" onClick={resetAssignmentForm}>
                  Cancel edit
                </button>
              </div>
            </>
          ) : null}
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>

      <PageSection title="Live assignments" description="Search by site, person, role, or status.">
        <QueryState
          loading={assignments.loading}
          error={assignments.error}
          hasData={assignments.data.length > 0}
          empty={{ title: "No assignments yet", description: "Create assignments here to connect sites with professionals." }}
        >
          <ListSearchField value={assignSearch} onChange={setAssignSearch} placeholder="Search assignments" ariaLabel="Search assignments" />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleAssignments.length > 0}
            empty={{ title: "No matching assignments", description: "Try another search or clear the filter." }}
          >
            <CardGrid>
              {visibleAssignments.map((assignment: any) => {
                const site = siteLookup.get(assignment.site_id);
                const user = userLookup.get(assignment.user_id);
                return (
                  <DataCard
                    key={assignment.id}
                    title={site?.site_name ?? assignment.site_id}
                    subtitle={user?.full_name ?? assignment.user_id}
                    meta={`${assignment.role} · ${assignment.status}`}
                  >
                    <p>Assigned at: {assignment.assigned_at ? new Date(assignment.assigned_at).toLocaleDateString("en-IN") : "-"}</p>
                    <p>Verification: {user?.verification_status ?? "-"}</p>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditingId(assignment.id);
                          setAssignCreateStep(1);
                          setForm({
                            site_id: assignment.site_id ?? "",
                            user_id: assignment.user_id ?? "",
                            role: assignment.role ?? "electrician",
                            status: assignment.status ?? "active"
                          });
                          mutation.reset();
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void deleteAssignment(assignment.id)}
                        disabled={mutation.isSubmitting}
                      >
                        Delete
                      </button>
                    </div>
                  </DataCard>
                );
              })}
            </CardGrid>
          </QueryState>
        </QueryState>
      </PageSection>
    </div>
  );
}
