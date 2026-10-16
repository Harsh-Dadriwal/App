"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { OrderWorkflowTimeline } from "@/components/order-workflow";
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
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { roleLabels, type AppRole } from "@mahalaxmi/core/types/domain";
import {
  approveOrderItemByCustomer,
  respondToSubstitute
} from "@/lib/backend/modules/workflow-gateway";

const CUSTOMER_SITE_STEPS = [
  { label: "Basics", description: "Code, name, budget" },
  { label: "Location", description: "Address and region" },
  { label: "Notes", description: "Description and save" }
] as const;

const CUSTOMER_DIRECTORY_TRADE_ROLES: AppRole[] = [
  "electrician",
  "pop_man",
  "carpenter",
  "painter",
  "tiles_man",
  "plumber"
];

function formatDirectoryTitle(roles: AppRole[]) {
  if (roles.length === 1) {
    const role = roles[0];
    if (role === "electrician") return "Verified electricians";
    if (role === "architect") return "Verified architects";
    if (role === "supplier") return "Verified suppliers";
    return `Verified ${roleLabels[role].toLowerCase()}s`;
  }

  if (roles.every((role) => CUSTOMER_DIRECTORY_TRADE_ROLES.includes(role))) {
    return "Verified handymen and trade partners";
  }

  return "Verified professionals";
}

function formatDirectoryPlaceholder(roles: AppRole[]) {
  if (roles.length === 1) {
    return `Search ${roleLabels[roles[0]].toLowerCase()}s`;
  }

  if (roles.every((role) => CUSTOMER_DIRECTORY_TRADE_ROLES.includes(role))) {
    return "Search handymen, trade skills, city, or company";
  }

  return "Search professionals";
}

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
    [customerId],
    { enabled: Boolean(customerId) }
  );
  const approvals = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_items_on_approval")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId],
    { enabled: Boolean(customerId) }
  );
  const budgets = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_budget_tracker")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId],
    { enabled: Boolean(customerId) }
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
        description="Your live project progress, approvals and spending at a glance."
      >
        <QueryState
          loading={sites.loading}
          error={sites.error}
          hasData={sites.data.length > 0}
          empty={{
            title: "No sites assigned",
            description: "You have no sites yet. Create your first site below to start tracking your project."
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
  roles
}: {
  roles: AppRole[];
}) {
  const [dirSearch, setDirSearch] = useState("");
  const title = useMemo(() => formatDirectoryTitle(roles), [roles]);
  const placeholder = useMemo(() => formatDirectoryPlaceholder(roles), [roles]);
  const directory = useRows(
    async (client) => {
      const { data, error } = await client
        .from("users")
        .select("full_name, username, city, state, phone, email, company_name, verification_status, role")
        .in("role", roles)
        .eq("status", "active")
        .eq("verification_status", "verified")
        .eq("is_admin_verified", true);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [roles.join("|")]
  );

  const visibleDirectory = useMemo(() => {
    const q = dirSearch.trim().toLowerCase();
    if (!q) return directory.data;
    return directory.data.filter((person: any) =>
      [
        person.full_name,
        person.username,
        person.city,
        person.state,
        person.email,
        person.phone,
        person.company_name,
        roleLabels[person.role as AppRole]
      ]
        .some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [directory.data, dirSearch]);

  return (
    <div className="page-stack">
      <PageSection
        title={title}
        description="Only active, verified and approved professionals appear here."
      >
        <QueryState
          loading={directory.loading}
          error={directory.error}
          hasData={directory.data.length > 0}
          empty={{
            title: "No matching professionals",
            description: "There are currently no verified professionals in this directory. When admin verifies them, they will appear here automatically."
          }}
        >
          <ListSearchField
            value={dirSearch}
            onChange={setDirSearch}
            placeholder={placeholder}
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
                  key={`${person.role}-${person.email ?? person.phone}`}
                  title={person.full_name ?? "Unnamed"}
                  subtitle={[person.city, person.state].filter(Boolean).join(", ")}
                  meta={person.company_name ?? roleLabels[person.role as AppRole] ?? "Professional"}
                >
                  <p>Role: {roleLabels[person.role as AppRole] ?? person.role}</p>
                  <p>Username: {person.username ?? "-"}</p>
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
    [customerId],
    { enabled: Boolean(customerId) }
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
    if (siteCreateStep >= 2 && !form.site_name.trim()) setSiteCreateStep(1);
    else if (siteCreateStep >= 3 && (!form.site_address_line1.trim() || !form.city.trim() || !form.state.trim())) setSiteCreateStep(2);
  }, [editingSiteId, siteCreateStep, form.site_name, form.site_address_line1, form.city, form.state]);

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

    const payload: any = {
      customer_id: customerId,
      created_by: customerId,
      site_name: form.site_name,
      project_type: form.project_type || null,
      site_address_line1: form.site_address_line1,
      city: form.city,
      state: form.state,
      postal_code: form.postal_code || null,
      estimated_budget: Number(form.estimated_budget || 0),
      description: form.description || null
    };
    
    // Only pass site_code if editing, else let trigger auto-assign it
    if (editingSiteId) {
      payload.site_code = form.site_code;
    }

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
            : "Work through the basics, then the location, then an optional description."
        }
      >
        <form onSubmit={saveSite} className="auth-form">
          {isSiteWizard ? <FlowWizardSteps steps={CUSTOMER_SITE_STEPS} currentStep={siteCreateStep} ariaLabel="Steps to create a site" /> : null}
          {editingSiteId ? <FormSectionHeader title="Site details" lead={<>Change any field, then save.</>} /> : null}

          {isSiteWizard && siteCreateStep === 1 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Site name
                  <input value={form.site_name} onChange={(e) => setForm((s) => ({ ...s, site_name: e.target.value }))} required autoFocus />
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
                <button type="button" className="primary-button" disabled={!form.site_name.trim()} onClick={() => setSiteCreateStep(2)}>
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
                  Site code (Assigned)
                  <input value={form.site_code} readOnly className="bg-gray-100 text-gray-500 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-500" />
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
            title: "No sites yet",
            description: "Add a site using the form above to get started."
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
        description="Helpful tips and guides for your project."
      >
        <QueryState
          loading={posts.loading}
          error={posts.error}
          hasData={posts.data.length > 0}
          empty={{
            title: "No tips published yet",
            description: `There are no tips in the "${category}" category yet.`
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
    [customerId],
    { enabled: Boolean(customerId) }
  );

  return (
    <PageSection
      title="Budget tracker"
      description="Your budget and spend across all sites."
    >
      <QueryState
        loading={budgets.loading}
        error={budgets.error}
        hasData={budgets.data.length > 0}
        empty={{
          title: "No budget details yet",
          description: "Your budget will show here once your orders are approved."
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

export function CustomerApprovalsPage() {
  const { profile } = useAuth();
  const customerId = profile?.id ?? "";
  const [selectedWorkflowItemId, setSelectedWorkflowItemId] = useState<string | null>(null);
  const approvals = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_customer_items_on_approval")
        .select("*")
        .eq("customer_id", customerId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [customerId],
    { enabled: Boolean(customerId) }
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
    [customerId],
    { enabled: Boolean(customerId) }
  );

  async function respond(orderItemId: string, approve: boolean) {
    const suggestion = suggestions.data.find((item: any) => item.original_order_item_id === orderItemId);
    const ok = await mutation.run(
      async () => {
        if (suggestion) {
          return respondToSubstitute({
            suggestion_id: suggestion.id,
            accept_choice: approve
          });
        }
        return approveOrderItemByCustomer({
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
      setSelectedWorkflowItemId(orderItemId);
    }
  }

  useEffect(() => {
    if (!selectedWorkflowItemId && approvals.data[0]?.order_item_id) {
      setSelectedWorkflowItemId(approvals.data[0].order_item_id);
    }
  }, [approvals.data, selectedWorkflowItemId]);

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
          description: "Items awaiting your approval will appear here."
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
                <button type="button" className="secondary-button" onClick={() => setSelectedWorkflowItemId(item.order_item_id)}>Timeline</button>
              </div>
            </DataCard>
          ))}
        </CardGrid>
      </QueryState>
      <OrderWorkflowTimeline
        entityType="order_item"
        entityId={selectedWorkflowItemId}
        title="Customer approval timeline"
        description="See how this line moved through architect review, substitute steps, and final customer action."
      />
    </PageSection>
  );
}
