"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  CardGrid,
  DataCard,
  DataTable,
  FlowWizardSteps,
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
import { getSupabaseBrowserClient } from "@/lib/supabase";

const CUSTOMER_SITE_STEPS = [
  { label: "Basics", description: "Code, name, budget" },
  { label: "Location", description: "Address and region" },
  { label: "Notes", description: "Description and save" }
] as const;

const CUSTOMER_FINANCE_STEPS = [
  { label: "Reference", description: "Application and site" },
  { label: "Amounts", description: "Requested and approved" },
  { label: "Finish", description: "Tenure and remarks" }
] as const;

export function CustomerDashboardPage() {
  const { profile } = useAuth();
  const customerId = profile?.id ?? "";
  const sites = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_site_projects")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId]
  );
  const approvals = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_items_on_approval")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId]
  );
  const budgets = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_budget_tracker")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId]
  );

  const totalBudget = budgets.data.reduce((sum, item: any) => sum + Number(item.revised_budget ?? 0), 0);
  const totalSpend = budgets.data.reduce(
    (sum, item: any) => sum + Number(item.actual_material_spend ?? 0),
    0
  );

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Sites", value: sites.data.length },
          { label: "Pending approvals", value: approvals.data.length },
          { label: "Planned budget", value: `₹${totalBudget.toLocaleString("en-IN")}` },
          { label: "Actual spend", value: `₹${totalSpend.toLocaleString("en-IN")}` }
        ]}
      />
      <PageSection
        title="Project overview"
        description="Customer dashboard data is coming directly from database views, not preview records."
      >
        <QueryState
          loading={sites.loading}
          error={sites.error}
          hasData={sites.data.length > 0}
          empty={{
            title: "No sites yet",
            description: "Create your first site in the database to see live customer project tracking here."
          }}
        >
          <CardGrid>
            {sites.data.map((site: any) => (
              <DataCard
                key={site.site_id}
                title={site.site_name}
                subtitle={`${site.city}, ${site.state}`}
                meta={site.site_status}
              >
                <p>Electrician: {site.electrician_name ?? "Not assigned"}</p>
                <p>Architect: {site.architect_name ?? "Not assigned"}</p>
                <p>Approvals waiting: {site.items_waiting_customer_action}</p>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function DirectoryPage({
  role
}: {
  role: "electrician" | "architect";
}) {
  const [dirSearch, setDirSearch] = useState("");
  const directory = useRows(
    async (client) => {
      const { data, error } = await client
        .from("users")
        .select("full_name, city, state, phone, email, company_name, verification_status")
        .eq("role", role)
        .eq("status", "active")
        .eq("verification_status", "verified")
        .eq("is_admin_verified", true);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [role]
  );

  const visibleDirectory = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    if (!q) return directory.data;
    return directory.data.filter((person: any) =>
      [person.full_name, person.city, person.state, person.email, person.phone, person.company_name]
        .some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [directory.data, dirSearch]);

  return (
    <div className="page-stack">
      <PageSection
        title={role === "electrician" ? "Verified electricians" : "Verified architects"}
        description="Only database records that are active and admin-verified appear here."
      >
        <QueryState
          loading={directory.loading}
          error={directory.error}
          hasData={directory.data.length > 0}
          empty={{
            title: "No verified professionals yet",
            description: "Admin-verify users in the database and they will appear automatically."
          }}
        >
          <ListSearchField
            value={dirSearch}
            onChange={setDirSearch}
            placeholder={`Search ${role === "electrician" ? "electricians" : "architects"}`}
            ariaLabel="Search directory"
          />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleDirectory.length > 0}
            empty={{ title: "No matches", description: "Try another name, city, or clear the search." }}
          >
            <CardGrid>
              {visibleDirectory.map((person: any) => (
                <DataCard
                  key={`${role}-${person.email ?? person.phone}`}
                  title={person.full_name ?? "Unnamed"}
                  subtitle={[person.city, person.state].filter(Boolean).join(", ")}
                  meta={person.company_name ?? role}
                >
                  <p>Email: {person.email ?? "-"}</p>
                  <p>Phone: {person.phone ?? "-"}</p>
                </DataCard>
              ))}
            </CardGrid>
          </QueryState>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function CustomerSitesPage() {
  const { profile } = useAuth();
  const customerId = profile?.id ?? "";
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
  const [siteCreateStep, setSiteCreateStep] = useState(1);
  const [siteSearch, setSiteSearch] = useState("");
  const [form, setForm] = useState({
    site_code: "",
    site_name: "",
    project_type: "",
    site_address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    estimated_budget: "",
    description: ""
  });
  const mutation = useMutationAction();
  const sites = useRows(
    async (client) => {
      const { data, error } = await client
        .from("sites")
        .select("id, site_code, site_name, project_type, site_address_line1, city, state, postal_code, estimated_budget, description, status")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId]
  );

  const visibleSites = useMemo(() => {
    const q = siteSearch.trim().toLowerCase();
    if (!q) return sites.data;
    return sites.data.filter((site: any) =>
      [site.site_name, site.site_code, site.city, site.state, site.status].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [sites.data, siteSearch]);

  useEffect(() => {
    if (editingSiteId) return;
    if (siteCreateStep >= 2 && (!form.site_code.trim() || !form.site_name.trim())) setSiteCreateStep(1);
    else if (siteCreateStep >= 3 && (!form.site_address_line1.trim() || !form.city.trim() || !form.state.trim())) setSiteCreateStep(2);
  }, [editingSiteId, siteCreateStep, form.site_code, form.site_name, form.site_address_line1, form.city, form.state]);

  const emptySiteForm = {
    site_code: "",
    site_name: "",
    project_type: "",
    site_address_line1: "",
    city: "",
    state: "",
    postal_code: "",
    estimated_budget: "",
    description: ""
  };

  function resetSiteForm() {
    setEditingSiteId(null);
    setSiteCreateStep(1);
    setForm({ ...emptySiteForm });
    mutation.reset();
  }

  async function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSiteId && siteCreateStep < 3) return;
    const client = await getSupabaseBrowserClient();
    if (!client || !customerId) {
      return;
    }

    const payload = {
      customer_id: customerId,
      created_by: customerId,
      site_code: form.site_code,
      site_name: form.site_name,
      project_type: form.project_type || null,
      site_address_line1: form.site_address_line1,
      city: form.city,
      state: form.state,
      postal_code: form.postal_code || null,
      estimated_budget: Number(form.estimated_budget || 0),
      description: form.description || null
    };

    const ok = await mutation.run(async () => {
      if (editingSiteId) {
        return client.from("sites").update(payload).eq("id", editingSiteId);
      }
      return client.from("sites").insert(payload);
    }, editingSiteId ? "Site updated successfully." : "Site created successfully.");

    if (ok) {
      resetSiteForm();
      sites.refetch?.();
    }
  }

  const isSiteWizard = !editingSiteId;

  return (
    <div className="page-stack">
      <FormCard
        title={editingSiteId ? "Edit site" : "Create site"}
        description={
          editingSiteId
            ? "Update your site record in one place."
            : "Work through basics, then location, then an optional description—the same guided layout as electrician and admin forms."
        }
      >
        <form onSubmit={saveSite} className="auth-form">
          {isSiteWizard ? <FlowWizardSteps steps={CUSTOMER_SITE_STEPS} currentStep={siteCreateStep} ariaLabel="Steps to create a site" /> : null}
          {editingSiteId ? <FormSectionHeader title="Site details" lead={<>Change any field, then save.</>} /> : null}

          {isSiteWizard && siteCreateStep === 1 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Site code
                  <input value={form.site_code} onChange={(e) => setForm((s) => ({ ...s, site_code: e.target.value }))} required autoFocus />
                  <FormFieldHint>Short internal reference (for example ME-001).</FormFieldHint>
                </label>
                <label>
                  Site name
                  <input value={form.site_name} onChange={(e) => setForm((s) => ({ ...s, site_name: e.target.value }))} required />
                </label>
                <label>
                  Project type
                  <input value={form.project_type} onChange={(e) => setForm((s) => ({ ...s, project_type: e.target.value }))} placeholder="Residential, commercial…" />
                </label>
                <label>
                  Estimated budget (₹)
                  <input type="number" min={0} value={form.estimated_budget} onChange={(e) => setForm((s) => ({ ...s, estimated_budget: e.target.value }))} />
                </label>
              </FormGrid>
              <div className="wizard-nav">
                <button type="button" className="primary-button" disabled={!form.site_code.trim() || !form.site_name.trim()} onClick={() => setSiteCreateStep(2)}>
                  Continue to location
                </button>
              </div>
            </div>
          ) : null}

          {isSiteWizard && siteCreateStep === 2 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Address
                  <input value={form.site_address_line1} onChange={(e) => setForm((s) => ({ ...s, site_address_line1: e.target.value }))} required autoFocus />
                </label>
                <label>
                  City
                  <input value={form.city} onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))} required />
                </label>
                <label>
                  State
                  <input value={form.state} onChange={(e) => setForm((s) => ({ ...s, state: e.target.value }))} required />
                </label>
                <label>
                  Postal code
                  <input value={form.postal_code} onChange={(e) => setForm((s) => ({ ...s, postal_code: e.target.value }))} />
                </label>
              </FormGrid>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setSiteCreateStep(1)}>
                  Back
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!form.site_address_line1.trim() || !form.city.trim() || !form.state.trim()}
                  onClick={() => setSiteCreateStep(3)}
                >
                  Continue to notes
                </button>
              </div>
            </div>
          ) : null}

          {isSiteWizard && siteCreateStep === 3 ? (
            <div className="wizard-step-body">
              <label>
                Description
                <textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} placeholder="Scope, access, or special requirements" />
                <FormFieldHint>Optional. You can always edit this later.</FormFieldHint>
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setSiteCreateStep(2)}>
                  Back
                </button>
                <button type="submit" className="primary-button" disabled={mutation.isSubmitting}>
                  {mutation.isSubmitting ? "Saving..." : "Create site"}
                </button>
              </div>
            </div>
          ) : null}

          {editingSiteId ? (
            <>
              <FormGrid>
                <label>
                  Site code
                  <input value={form.site_code} onChange={(e) => setForm((s) => ({ ...s, site_code: e.target.value }))} required />
                </label>
                <label>
                  Site name
                  <input value={form.site_name} onChange={(e) => setForm((s) => ({ ...s, site_name: e.target.value }))} required />
                </label>
                <label>
                  Project type
                  <input value={form.project_type} onChange={(e) => setForm((s) => ({ ...s, project_type: e.target.value }))} />
                </label>
                <label>
                  Budget
                  <input type="number" value={form.estimated_budget} onChange={(e) => setForm((s) => ({ ...s, estimated_budget: e.target.value }))} />
                </label>
                <label>
                  Address
                  <input value={form.site_address_line1} onChange={(e) => setForm((s) => ({ ...s, site_address_line1: e.target.value }))} required />
                </label>
                <label>
                  City
                  <input value={form.city} onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))} required />
                </label>
                <label>
                  State
                  <input value={form.state} onChange={(e) => setForm((s) => ({ ...s, state: e.target.value }))} required />
                </label>
                <label>
                  Postal code
                  <input value={form.postal_code} onChange={(e) => setForm((s) => ({ ...s, postal_code: e.target.value }))} />
                </label>
              </FormGrid>
              <label>
                Description
                <textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
              </label>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={mutation.isSubmitting}>
                  {mutation.isSubmitting ? "Saving..." : "Update site"}
                </button>
                <button type="button" className="secondary-button" onClick={resetSiteForm}>
                  Cancel edit
                </button>
              </div>
            </>
          ) : null}
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>

      <PageSection
        title="Electrical requirement for site"
        description="Search your sites, then open one to edit. Same card layout other roles see for projects."
      >
        <QueryState
          loading={sites.loading}
          error={sites.error}
          hasData={sites.data.length > 0}
          empty={{
            title: "No site records found",
            description: "Insert site data in the database to populate this section."
          }}
        >
          <ListSearchField value={siteSearch} onChange={setSiteSearch} placeholder="Search by name, code, city, or status" ariaLabel="Search sites" />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleSites.length > 0}
            empty={{ title: "No matching sites", description: "Try another search or clear the filter." }}
          >
            <CardGrid>
              {visibleSites.map((site: any) => (
                <DataCard key={site.id} title={site.site_name} subtitle={site.project_type} meta={site.status}>
                  <p>{site.site_address_line1}</p>
                  <p>
                    {site.city}, {site.state}
                  </p>
                  <p>Budget: ₹{Number(site.estimated_budget ?? 0).toLocaleString("en-IN")}</p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingSiteId(site.id);
                        setSiteCreateStep(1);
                        setForm({
                          site_code: site.site_code ?? "",
                          site_name: site.site_name ?? "",
                          project_type: site.project_type ?? "",
                          site_address_line1: site.site_address_line1 ?? "",
                          city: site.city ?? "",
                          state: site.state ?? "",
                          postal_code: site.postal_code ?? "",
                          estimated_budget: String(site.estimated_budget ?? ""),
                          description: site.description ?? ""
                        });
                        mutation.reset();
                      }}
                    >
                      Edit
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

export function TipsPage({ category }: { category: "electrical_tips" | "home_tips" }) {
  const [tipSearch, setTipSearch] = useState("");
  const posts = useRows(
    async (client) => {
      const { data, error } = await client
        .from("content_posts")
        .select("id, title, summary, published_at, category")
        .eq("category", category)
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [category]
  );

  const visibleTips = useMemo(() => {
    const q = tipSearch.trim().toLowerCase();
    if (!q) return posts.data;
    return posts.data.filter((post: any) =>
      [post.title, post.summary].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [posts.data, tipSearch]);

  return (
    <div className="page-stack">
      <PageSection
        title={category === "electrical_tips" ? "Electrical tips & tricks" : "Home tips & tricks"}
        description="Published content is fetched from the database content table."
      >
        <QueryState
          loading={posts.loading}
          error={posts.error}
          hasData={posts.data.length > 0}
          empty={{
            title: "No published posts yet",
            description: "Add and publish content from the admin content page or directly in the database."
          }}
        >
          <ListSearchField value={tipSearch} onChange={setTipSearch} placeholder="Search tips by title or summary" ariaLabel="Search tips" />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleTips.length > 0}
            empty={{ title: "No matching tips", description: "Try different words or clear the search." }}
          >
            <CardGrid>
              {visibleTips.map((post: any) => (
                <DataCard
                  key={post.id}
                  title={post.title}
                  subtitle={post.summary}
                  meta={post.published_at ? new Date(post.published_at).toLocaleDateString() : "Draft"}
                />
              ))}
            </CardGrid>
          </QueryState>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function CustomerBudgetPage() {
  const { profile } = useAuth();
  const customerId = profile?.id ?? "";
  const budgets = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_budget_tracker")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId]
  );

  return (
    <PageSection
      title="Budget tracker"
      description="Budget numbers are sourced from the tracker table and site spend fields."
    >
      <QueryState
        loading={budgets.loading}
        error={budgets.error}
        hasData={budgets.data.length > 0}
        empty={{
          title: "No budget rows found",
          description: "Create budget tracker rows for the customer's sites to see live spend tracking."
        }}
      >
        <DataTable
          columns={["Site", "Initial", "Revised", "Approved", "Actual", "Remaining"]}
          rows={budgets.data.map((item: any) => [
            item.site_name,
            `₹${Number(item.initial_budget).toLocaleString("en-IN")}`,
            `₹${Number(item.revised_budget).toLocaleString("en-IN")}`,
            `₹${Number(item.approved_material_budget).toLocaleString("en-IN")}`,
            `₹${Number(item.actual_material_spend).toLocaleString("en-IN")}`,
            `₹${Number(item.remaining_budget).toLocaleString("en-IN")}`
          ])}
        />
      </QueryState>
    </PageSection>
  );
}

export function CustomerFinancePage() {
  const { profile } = useAuth();
  const customerId = profile?.id ?? "";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [financeCreateStep, setFinanceCreateStep] = useState(1);
  const [financeSearch, setFinanceSearch] = useState("");
  const [form, setForm] = useState({
    application_number: "",
    site_id: "",
    requested_amount: "",
    approved_amount: "",
    tenure_months: "",
    remarks: ""
  });
  const mutation = useMutationAction();
  const siteOptions = useRows(async (client) => {
    const { data, error } = await client.from("sites").select("id, site_name").eq("customer_id", customerId);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [customerId]);
  const finance = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_finance_applications")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId]
  );

  const visibleFinance = useMemo(() => {
    const q = financeSearch.trim().toLowerCase();
    if (!q) return finance.data;
    return finance.data.filter((item: any) =>
      [item.application_number, item.site_name, item.status, item.remarks].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [finance.data, financeSearch]);

  useEffect(() => {
    if (editingId) return;
    if (financeCreateStep >= 2 && !form.application_number.trim()) setFinanceCreateStep(1);
    else if (financeCreateStep >= 3 && !form.requested_amount.trim()) setFinanceCreateStep(2);
  }, [editingId, financeCreateStep, form.application_number, form.requested_amount]);

  const emptyFinanceForm = {
    application_number: "",
    site_id: "",
    requested_amount: "",
    approved_amount: "",
    tenure_months: "",
    remarks: ""
  };

  function resetFinanceForm() {
    setEditingId(null);
    setFinanceCreateStep(1);
    setForm({ ...emptyFinanceForm });
    mutation.reset();
  }

  async function saveFinance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId && financeCreateStep < 3) return;
    const client = await getSupabaseBrowserClient();
    if (!client || !customerId) return;
    const payload = {
      customer_id: customerId,
      site_id: form.site_id || null,
      application_number: form.application_number,
      requested_amount: Number(form.requested_amount),
      approved_amount: form.approved_amount ? Number(form.approved_amount) : null,
      tenure_months: form.tenure_months ? Number(form.tenure_months) : null,
      remarks: form.remarks || null
    };
    const ok = await mutation.run(async () => {
      if (editingId) return client.from("finance_applications").update(payload).eq("id", editingId);
      return client.from("finance_applications").insert(payload);
    }, editingId ? "Finance application updated." : "Finance application created.");
    if (ok) {
      resetFinanceForm();
      finance.refetch?.();
    }
  }

  const isFinanceWizard = !editingId;

  return (
    <div className="page-stack">
      <FormCard
        title={editingId ? "Edit finance request" : "Create finance request"}
        description={
          editingId
            ? "Update this application in one form."
            : "Step through reference, amounts, then tenure and notes—aligned with how other roles fill long forms."
        }
      >
        <form onSubmit={saveFinance} className="auth-form">
          {isFinanceWizard ? <FlowWizardSteps steps={CUSTOMER_FINANCE_STEPS} currentStep={financeCreateStep} ariaLabel="Steps for finance request" /> : null}
          {editingId ? <FormSectionHeader title="Finance application" lead={<>Adjust fields, then save.</>} /> : null}

          {isFinanceWizard && financeCreateStep === 1 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Application number
                  <input value={form.application_number} onChange={(e) => setForm((s) => ({ ...s, application_number: e.target.value }))} required autoFocus />
                  <FormFieldHint>Your own reference (for example a bank or internal id).</FormFieldHint>
                </label>
                <label>
                  Related site
                  <select value={form.site_id} onChange={(e) => setForm((s) => ({ ...s, site_id: e.target.value }))}>
                    <option value="">Optional — select site</option>
                    {siteOptions.data.map((site: any) => (
                      <option key={site.id} value={site.id}>
                        {site.site_name}
                      </option>
                    ))}
                  </select>
                </label>
              </FormGrid>
              <div className="wizard-nav">
                <button type="button" className="primary-button" disabled={!form.application_number.trim()} onClick={() => setFinanceCreateStep(2)}>
                  Continue to amounts
                </button>
              </div>
            </div>
          ) : null}

          {isFinanceWizard && financeCreateStep === 2 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Requested amount (₹)
                  <input type="number" min={0} step="0.01" value={form.requested_amount} onChange={(e) => setForm((s) => ({ ...s, requested_amount: e.target.value }))} required autoFocus />
                </label>
                <label>
                  Approved amount (₹)
                  <input type="number" min={0} step="0.01" value={form.approved_amount} onChange={(e) => setForm((s) => ({ ...s, approved_amount: e.target.value }))} />
                  <FormFieldHint>Optional if not approved yet.</FormFieldHint>
                </label>
              </FormGrid>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setFinanceCreateStep(1)}>
                  Back
                </button>
                <button type="button" className="primary-button" disabled={!form.requested_amount.trim()} onClick={() => setFinanceCreateStep(3)}>
                  Continue
                </button>
              </div>
            </div>
          ) : null}

          {isFinanceWizard && financeCreateStep === 3 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Tenure (months)
                  <input type="number" min={0} value={form.tenure_months} onChange={(e) => setForm((s) => ({ ...s, tenure_months: e.target.value }))} />
                </label>
              </FormGrid>
              <label>
                Remarks
                <textarea value={form.remarks} onChange={(e) => setForm((s) => ({ ...s, remarks: e.target.value }))} placeholder="Notes for your records or the lender" />
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setFinanceCreateStep(2)}>
                  Back
                </button>
                <button type="submit" className="primary-button" disabled={mutation.isSubmitting}>
                  {mutation.isSubmitting ? "Saving..." : "Create request"}
                </button>
              </div>
            </div>
          ) : null}

          {editingId ? (
            <>
              <FormGrid>
                <label>
                  Application number
                  <input value={form.application_number} onChange={(e) => setForm((s) => ({ ...s, application_number: e.target.value }))} required />
                </label>
                <label>
                  Site
                  <select value={form.site_id} onChange={(e) => setForm((s) => ({ ...s, site_id: e.target.value }))}>
                    <option value="">Select site</option>
                    {siteOptions.data.map((site: any) => (
                      <option key={site.id} value={site.id}>
                        {site.site_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Requested amount
                  <input type="number" value={form.requested_amount} onChange={(e) => setForm((s) => ({ ...s, requested_amount: e.target.value }))} required />
                </label>
                <label>
                  Approved amount
                  <input type="number" value={form.approved_amount} onChange={(e) => setForm((s) => ({ ...s, approved_amount: e.target.value }))} />
                </label>
                <label>
                  Tenure months
                  <input type="number" value={form.tenure_months} onChange={(e) => setForm((s) => ({ ...s, tenure_months: e.target.value }))} />
                </label>
              </FormGrid>
              <label>
                Remarks
                <textarea value={form.remarks} onChange={(e) => setForm((s) => ({ ...s, remarks: e.target.value }))} />
              </label>
              <div className="form-actions">
                <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Update request"}
                </button>
                <button type="button" className="secondary-button" onClick={resetFinanceForm}>
                  Cancel edit
                </button>
              </div>
            </>
          ) : null}
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>
      <PageSection title="Finance facility" description="Search applications by number, site, or status.">
        <QueryState
          loading={finance.loading}
          error={finance.error}
          hasData={finance.data.length > 0}
          empty={{
            title: "No finance applications yet",
            description: "Finance applications will appear here when they are inserted in the database."
          }}
        >
          <ListSearchField value={financeSearch} onChange={setFinanceSearch} placeholder="Search finance applications" ariaLabel="Search finance applications" />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleFinance.length > 0}
            empty={{ title: "No matching applications", description: "Try another search or clear the filter." }}
          >
            <CardGrid>
              {visibleFinance.map((item: any) => (
                <DataCard key={item.id} title={item.application_number} subtitle={item.site_name ?? "-"} meta={item.status}>
                  <p>Requested: ₹{Number(item.requested_amount).toLocaleString("en-IN")}</p>
                  <p>Tenure: {item.tenure_months ?? "-"} months</p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingId(item.id);
                        setFinanceCreateStep(1);
                        setForm({
                          application_number: item.application_number ?? "",
                          site_id: item.site_id ?? "",
                          requested_amount: String(item.requested_amount ?? ""),
                          approved_amount: item.approved_amount ? String(item.approved_amount) : "",
                          tenure_months: item.tenure_months ? String(item.tenure_months) : "",
                          remarks: item.remarks ?? ""
                        });
                        mutation.reset();
                      }}
                    >
                      Edit
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

export function CustomerApprovalsPage() {
  const { profile } = useAuth();
  const customerId = profile?.id ?? "";
  const approvals = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_items_on_approval")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId]
  );

  const mutation = useMutationAction();
  const suggestions = useRows(
    async (client) => {
      const { data, error } = await client
        .from("substitute_suggestions")
        .select("id, original_order_item_id, suggested_product_id, status")
        .eq("customer_id", customerId)
        .eq("status", "suggested");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId]
  );

  async function respond(orderItemId: string, approve: boolean) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const suggestion = suggestions.data.find((item: any) => item.original_order_item_id === orderItemId);
    const ok = await mutation.run(
      async () => {
        if (suggestion) {
          return client.rpc("respond_to_substitute", {
            suggestion_id: suggestion.id,
            accept_choice: approve
          });
        }
        return client.rpc("approve_order_item_by_customer", {
          target_order_item_id: orderItemId,
          approve,
          note_text: approve ? "Approved from customer app" : "Rejected from customer app"
        });
      },
      suggestion
        ? approve
          ? "Substitute accepted."
          : "Substitute rejected."
        : approve
          ? "Item approved."
          : "Item rejected."
    );
    if (ok) {
      approvals.refetch?.();
      suggestions.refetch?.();
    }
  }

  return (
    <PageSection
      title="Items on approval"
      description="Customer approval queue for material items and substitution decisions."
    >
      <QueryState
        loading={approvals.loading}
        error={approvals.error}
        hasData={approvals.data.length > 0}
        empty={{
          title: "No approval items waiting",
          description: "When electrician or architect workflows reach customer approval, records will appear here."
        }}
      >
        <FormNotice error={mutation.error} success={mutation.success} />
        <CardGrid>
          {approvals.data.map((item: any) => (
            <DataCard
              key={item.order_item_id}
              title={item.item_name_snapshot}
              subtitle={item.site_name}
              meta={item.status}
            >
              <p>Brand: {item.brand_name_snapshot ?? "-"}</p>
              <p>Quantity: {item.quantity_required ?? "-"}</p>
              <p>Line total: ₹{Number(item.line_total ?? 0).toLocaleString("en-IN")}</p>
              <div className="inline-actions">
                <button type="button" className="primary-button" disabled={mutation.isSubmitting} onClick={() => void respond(item.order_item_id, true)}>Approve</button>
                <button type="button" className="secondary-button" disabled={mutation.isSubmitting} onClick={() => void respond(item.order_item_id, false)}>Reject</button>
              </div>
            </DataCard>
          ))}
        </CardGrid>
      </QueryState>
    </PageSection>
  );
}
