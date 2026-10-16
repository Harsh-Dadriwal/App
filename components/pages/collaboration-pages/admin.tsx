"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { ADMIN_ASSIGN_STEPS } from "./shared";
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
