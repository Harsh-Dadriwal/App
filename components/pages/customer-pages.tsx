"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  CardGrid,
  DataCard,
  DataTable,
  FormCard,
  FormGrid,
  FormNotice,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { getSupabaseBrowserClient } from "@/lib/supabase";

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

  return (
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
        <CardGrid>
          {directory.data.map((person: any) => (
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
    </PageSection>
  );
}

export function CustomerSitesPage() {
  const { profile } = useAuth();
  const customerId = profile?.id ?? "";
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null);
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

  async function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setEditingSiteId(null);
      setForm({
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
      sites.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <FormCard
        title={editingSiteId ? "Edit site" : "Create site"}
        description="Customers can create and update their sites directly from the frontend."
      >
        <form onSubmit={saveSite} className="auth-form">
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
              {mutation.isSubmitting ? "Saving..." : editingSiteId ? "Update site" : "Create site"}
            </button>
            {editingSiteId ? (
              <button type="button" className="secondary-button" onClick={() => {
                setEditingSiteId(null);
                setForm({
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
                mutation.reset();
              }}>
                Cancel edit
              </button>
            ) : null}
          </div>
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>

      <PageSection
        title="Electrical requirement for site"
        description="Each site shows status, partner assignments, and material progress."
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
          <CardGrid>
            {sites.data.map((site: any) => (
              <DataCard key={site.id} title={site.site_name} subtitle={site.project_type} meta={site.status}>
                <p>{site.site_address_line1}</p>
                <p>{site.city}, {site.state}</p>
                <p>Budget: ₹{Number(site.estimated_budget ?? 0).toLocaleString("en-IN")}</p>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => {
                    setEditingSiteId(site.id);
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
                  }}>
                    Edit
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

export function TipsPage({ category }: { category: "electrical_tips" | "home_tips" }) {
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

  return (
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
        <CardGrid>
          {posts.data.map((post: any) => (
            <DataCard
              key={post.id}
              title={post.title}
              subtitle={post.summary}
              meta={post.published_at ? new Date(post.published_at).toLocaleDateString() : "Draft"}
            />
          ))}
        </CardGrid>
      </QueryState>
    </PageSection>
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

  async function saveFinance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setEditingId(null);
      setForm({ application_number: "", site_id: "", requested_amount: "", approved_amount: "", tenure_months: "", remarks: "" });
      finance.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <FormCard title={editingId ? "Edit finance request" : "Create finance request"} description="Customers can submit and update finance requests from the app.">
        <form onSubmit={saveFinance} className="auth-form">
          <FormGrid>
            <label>
              Application number
              <input value={form.application_number} onChange={(e) => setForm((s) => ({ ...s, application_number: e.target.value }))} required />
            </label>
            <label>
              Site
              <select value={form.site_id} onChange={(e) => setForm((s) => ({ ...s, site_id: e.target.value }))}>
                <option value="">Select site</option>
                {siteOptions.data.map((site: any) => <option key={site.id} value={site.id}>{site.site_name}</option>)}
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
            <button className="primary-button" disabled={mutation.isSubmitting}>{mutation.isSubmitting ? "Saving..." : editingId ? "Update request" : "Create request"}</button>
            {editingId ? (
              <button type="button" className="secondary-button" onClick={() => {
                setEditingId(null);
                setForm({ application_number: "", site_id: "", requested_amount: "", approved_amount: "", tenure_months: "", remarks: "" });
                mutation.reset();
              }}>
                Cancel edit
              </button>
            ) : null}
          </div>
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>
      <PageSection
        title="Finance facility"
        description="Track customer finance requests and their current review status."
      >
        <QueryState
          loading={finance.loading}
          error={finance.error}
          hasData={finance.data.length > 0}
          empty={{
            title: "No finance applications yet",
            description: "Finance applications will appear here when they are inserted in the database."
          }}
        >
          <CardGrid>
            {finance.data.map((item: any) => (
              <DataCard key={item.id} title={item.application_number} subtitle={item.site_name ?? "-"} meta={item.status}>
                <p>Requested: ₹{Number(item.requested_amount).toLocaleString("en-IN")}</p>
                <p>Tenure: {item.tenure_months ?? "-"} months</p>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => {
                    setEditingId(item.id);
                    setForm({
                      application_number: item.application_number ?? "",
                      site_id: item.site_id ?? "",
                      requested_amount: String(item.requested_amount ?? ""),
                      approved_amount: item.approved_amount ? String(item.approved_amount) : "",
                      tenure_months: item.tenure_months ? String(item.tenure_months) : "",
                      remarks: item.remarks ?? ""
                    });
                    mutation.reset();
                  }}>Edit</button>
                </div>
              </DataCard>
            ))}
          </CardGrid>
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
