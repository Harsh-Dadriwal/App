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
import type { AppRole } from "@mahalaxmi/core/types/domain";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { NOTE_STEPS, getRecipientOptions, useAccessibleSites } from "./shared";
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
