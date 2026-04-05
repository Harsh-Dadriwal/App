"use client";

import { useMemo, useState, type FormEvent } from "react";
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

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export function ElectricianDashboardPage() {
  const { profile } = useAuth();
  const electricianId = profile?.id ?? "";
  const ongoing = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_electrician_ongoing_projects")
        .select("*")
        .eq("electrician_id", electricianId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [electricianId]
  );
  const newProjects = useRows(
    async (client) => {
      const { data, error } = await client.from("vw_electrician_new_projects").select("*");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const customerPending = ongoing.data.reduce(
    (sum, row: any) => sum + Number(row.customer_pending_items ?? 0),
    0
  );

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Open bids", value: newProjects.data.length },
          { label: "Ongoing projects", value: ongoing.data.length },
          { label: "Customer pending items", value: customerPending },
          { label: "Supplied items", value: ongoing.data.reduce((sum, row: any) => sum + Number(row.supplied_items ?? 0), 0) }
        ]}
      />
      <PageSection
        title="Electrician activity"
        description="Bid opportunities and live project execution are both sourced from database views."
      >
        <QueryState
          loading={ongoing.loading}
          error={ongoing.error}
          hasData={ongoing.data.length > 0}
          empty={{
            title: "No active electrician projects",
            description: "Assign an electrician to a site in the database to populate this dashboard."
          }}
        >
          <CardGrid>
            {ongoing.data.map((project: any) => (
              <DataCard
                key={project.site_id}
                title={project.site_name}
                subtitle={project.customer_name}
                meta={project.site_status}
              >
                <p>Architect pending: {project.architect_pending_items}</p>
                <p>Customer pending: {project.customer_pending_items}</p>
                <p>Supply pending: {project.supply_pending_items}</p>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function ElectricianProjectsPage({
  mode
}: {
  mode: "new" | "market" | "ongoing";
}) {
  const { profile } = useAuth();
  const electricianId = profile?.id ?? "";
  const query = useRows(
    async (client) => {
      if (mode === "new") {
        const { data, error } = await client.from("vw_electrician_new_projects").select("*");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      if (mode === "market") {
        const { data, error } = await client.from("vw_electrician_projects_assigned_to_others").select("*");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      const { data, error } = await client
        .from("vw_electrician_ongoing_projects")
        .select("*")
        .eq("electrician_id", electricianId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [mode, electricianId]
  );

  const titleMap = {
    new: "New projects",
    market: "Projects assigned to others",
    ongoing: "Ongoing projects"
  } as const;
  const [bidForm, setBidForm] = useState({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
  const [editingBidId, setEditingBidId] = useState<string | null>(null);
  const mutation = useMutationAction();
  const myBids = useRows(async (client) => {
    const { data, error } = await client
      .from("project_bids")
      .select("id, site_id, bid_amount, estimated_days, notes, status")
      .eq("bidder_user_id", electricianId)
      .eq("bidder_role", "electrician")
      .order("submitted_at", { ascending: false });
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [electricianId]);

  async function saveBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client || !electricianId) return;
    const ok = await mutation.run(async () => {
      const payload = {
        site_id: bidForm.site_id,
        bidder_user_id: electricianId,
        bidder_role: "electrician",
        bid_amount: Number(bidForm.bid_amount),
        estimated_days: bidForm.estimated_days ? Number(bidForm.estimated_days) : null,
        notes: bidForm.notes || null
      };
      if (editingBidId) {
        return client.from("project_bids").update(payload).eq("id", editingBidId);
      }
      return client.from("project_bids").insert(payload);
    }, editingBidId ? "Bid updated successfully." : "Bid submitted successfully.");
    if (ok) {
      setEditingBidId(null);
      setBidForm({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
      query.refetch?.();
      myBids.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      {mode === "new" ? (
        <FormCard title="Submit bid" description="Electricians can submit bids directly from the app.">
          <form onSubmit={saveBid} className="auth-form">
            <FormGrid>
              <label>
                Site
                <select value={bidForm.site_id} onChange={(e) => setBidForm((s) => ({ ...s, site_id: e.target.value }))} required>
                  <option value="">Select project</option>
                  {query.data.map((project: any) => <option key={project.site_id} value={project.site_id}>{project.site_name}</option>)}
                </select>
              </label>
              <label>
                Bid amount
                <input type="number" value={bidForm.bid_amount} onChange={(e) => setBidForm((s) => ({ ...s, bid_amount: e.target.value }))} required />
              </label>
              <label>
                Estimated days
                <input type="number" value={bidForm.estimated_days} onChange={(e) => setBidForm((s) => ({ ...s, estimated_days: e.target.value }))} />
              </label>
            </FormGrid>
            <label>
              Notes
              <textarea value={bidForm.notes} onChange={(e) => setBidForm((s) => ({ ...s, notes: e.target.value }))} />
            </label>
            <div className="form-actions">
              <button className="primary-button" disabled={mutation.isSubmitting}>{mutation.isSubmitting ? "Submitting..." : "Submit bid"}</button>
              {editingBidId ? (
                <button type="button" className="secondary-button" onClick={() => {
                  setEditingBidId(null);
                  setBidForm({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
                  mutation.reset();
                }}>
                  Cancel edit
                </button>
              ) : null}
            </div>
            <FormNotice error={mutation.error} success={mutation.success} />
          </form>
        </FormCard>
      ) : null}
      {mode === "new" ? (
        <PageSection title="My bids" description="You can revisit and edit bids you already submitted.">
          <QueryState
            loading={myBids.loading}
            error={myBids.error}
            hasData={myBids.data.length > 0}
            empty={{ title: "No bids yet", description: "Submitted bids will appear here for quick edits." }}
          >
            <CardGrid>
              {myBids.data.map((bid: any) => (
                <DataCard key={bid.id} title={bid.site_id} subtitle={`₹${Number(bid.bid_amount ?? 0).toLocaleString("en-IN")}`} meta={bid.status}>
                  <p>Estimated days: {bid.estimated_days ?? "-"}</p>
                  <p>{bid.notes ?? "No notes added."}</p>
                  <div className="inline-actions">
                    <button type="button" className="secondary-button" onClick={() => {
                      setEditingBidId(bid.id);
                      setBidForm({
                        site_id: bid.site_id ?? "",
                        bidder_role: "electrician",
                        bid_amount: String(bid.bid_amount ?? ""),
                        estimated_days: bid.estimated_days ? String(bid.estimated_days) : "",
                        notes: bid.notes ?? ""
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
      ) : null}
      <PageSection
        title={titleMap[mode]}
        description="Project data is being read live from the matching electrician database view."
      >
        <QueryState
          loading={query.loading}
          error={query.error}
          hasData={query.data.length > 0}
          empty={{
            title: "No matching project records",
            description: "Once rows exist in the corresponding project view, they will appear here."
          }}
        >
          <DataTable
            columns={
              mode === "ongoing"
                ? ["Site", "Customer", "Status", "Architect Pending", "Customer Pending", "Supplied"]
                : ["Site", "Project Type", "City", "State", "Budget", "Status"]
            }
            rows={
              mode === "ongoing"
                ? query.data.map((row: any) => [
                    row.site_name,
                    row.customer_name,
                    row.site_status,
                    row.architect_pending_items,
                    row.customer_pending_items,
                    row.supplied_items
                  ])
                : query.data.map((row: any) => [
                    row.site_name,
                    row.project_type,
                    row.city,
                    row.state,
                    row.estimated_budget ? `₹${Number(row.estimated_budget).toLocaleString("en-IN")}` : "-",
                    row.status
                  ])
            }
          />
        </QueryState>
      </PageSection>
    </div>
  );
}

export function ElectricianMaterialsPage() {
  const { profile } = useAuth();
  const electricianId = profile?.id ?? "";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    site_id: "",
    site_order_id: "",
    category_id: "",
    brand_id: "",
    product_search: "",
    product_id: "",
    item_name_snapshot: "",
    unit_snapshot: "pcs",
    quantity_required: "",
    unit_price: "",
    category_name_snapshot: "",
    brand_name_snapshot: "",
    approval_mode: "architect_then_customer",
    electrician_notes: ""
  });
  const mutation = useMutationAction();
  const ongoingProjects = useRows(async (client) => {
    const { data, error } = await client.from("vw_electrician_ongoing_projects").select("site_id, site_name").eq("electrician_id", electricianId);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [electricianId]);
  const siteOrders = useRows(async (client) => {
    const { data, error } = await client.from("site_orders").select("id, order_number, site_id");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const products = useRows(async (client) => {
    const { data, error } = await client
      .from("products")
      .select("id, item_name, sku, unit, category_id, brand_id, base_price");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const categories = useRows(async (client) => {
    const { data, error } = await client.from("product_categories").select("id, name").order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const brands = useRows(async (client) => {
    const { data, error } = await client.from("product_brands").select("id, name, category_id").order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const materials = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_electrician_material_tracker")
        .select("*")
        .eq("electrician_id", electricianId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [electricianId]
  );

  const filteredOrders = useMemo(
    () => siteOrders.data.filter((order: any) => !form.site_id || order.site_id === form.site_id),
    [siteOrders.data, form.site_id]
  );
  const filteredBrands = useMemo(
    () => brands.data.filter((brand: any) => !form.category_id || brand.category_id === form.category_id),
    [brands.data, form.category_id]
  );
  const filteredProducts = useMemo(
    () =>
      products.data.filter((product: any) => {
        const categoryMatch = !form.category_id || product.category_id === form.category_id;
        const brandMatch = !form.brand_id || product.brand_id === form.brand_id;
        const query = form.product_search.trim();
        const searchMatch =
          !query ||
          [product.item_name, product.sku].some((value) => matchesQuery(String(value ?? ""), query));
        return categoryMatch && brandMatch && searchMatch;
      }),
    [products.data, form.category_id, form.brand_id, form.product_search]
  );
  const categoryLookup = useMemo(
    () => new Map(categories.data.map((category: any) => [category.id, category.name])),
    [categories.data]
  );
  const brandLookup = useMemo(
    () => new Map(brands.data.map((brand: any) => [brand.id, brand.name])),
    [brands.data]
  );

  async function saveOrderItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client || !electricianId) return;
    const payload = {
      site_id: form.site_id,
      site_order_id: form.site_order_id,
      product_id: form.product_id,
      source: "electrician",
      source_user_id: electricianId,
      approval_mode: form.approval_mode,
      requires_architect_approval: form.approval_mode === "architect_then_customer",
      item_name_snapshot: form.item_name_snapshot,
      category_name_snapshot: form.category_name_snapshot || null,
      brand_name_snapshot: form.brand_name_snapshot || null,
      unit_snapshot: form.unit_snapshot,
      quantity_required: Number(form.quantity_required),
      unit_price: Number(form.unit_price || 0),
      line_subtotal: Number(form.quantity_required || 0) * Number(form.unit_price || 0),
      line_total: Number(form.quantity_required || 0) * Number(form.unit_price || 0),
      electrician_notes: form.electrician_notes || null,
      status: form.approval_mode === "architect_then_customer" ? "pending_architect_approval" : "pending_customer_approval"
    };
    const ok = await mutation.run(async () => {
      if (editingId) return client.from("order_items").update(payload).eq("id", editingId);
      return client.from("order_items").insert(payload);
    }, editingId ? "Order item updated." : "Order item created.");
    if (ok) {
      setEditingId(null);
      setForm({ site_id: "", site_order_id: "", category_id: "", brand_id: "", product_search: "", product_id: "", item_name_snapshot: "", unit_snapshot: "pcs", quantity_required: "", unit_price: "", category_name_snapshot: "", brand_name_snapshot: "", approval_mode: "architect_then_customer", electrician_notes: "" });
      materials.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <FormCard title={editingId ? "Edit order item" : "Create order item"} description="Electricians can create and update material requirement lines.">
        <form onSubmit={saveOrderItem} className="auth-form">
          <FormGrid>
            <label>
              Site
              <select value={form.site_id} onChange={(e) => setForm((s) => ({ ...s, site_id: e.target.value }))} required>
                <option value="">Select site</option>
                {ongoingProjects.data.map((site: any) => <option key={site.site_id} value={site.site_id}>{site.site_name}</option>)}
              </select>
            </label>
            <label>
              Order
              <select value={form.site_order_id} onChange={(e) => setForm((s) => ({ ...s, site_order_id: e.target.value }))} required>
                <option value="">Select order</option>
                {filteredOrders.map((order: any) => <option key={order.id} value={order.id}>{order.order_number}</option>)}
              </select>
            </label>
            <label>
              Category
              <select value={form.category_id} onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value, brand_id: "", product_id: "", product_search: "" }))} required>
                <option value="">Select category</option>
                {categories.data.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>
              Brand
              <select value={form.brand_id} onChange={(e) => setForm((s) => ({ ...s, brand_id: e.target.value, product_id: "", product_search: "" }))} required>
                <option value="">Select brand</option>
                {filteredBrands.map((brand: any) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label>
              Search product
              <input value={form.product_search} onChange={(e) => setForm((s) => ({ ...s, product_search: e.target.value, product_id: "" }))} placeholder="Type item name or SKU" />
            </label>
            <label>
              Product
              <select value={form.product_id} onChange={(e) => {
                const product = products.data.find((item: any) => item.id === e.target.value);
                setForm((s) => ({
                  ...s,
                  product_id: e.target.value,
                  item_name_snapshot: product?.item_name ?? s.item_name_snapshot,
                  unit_snapshot: product?.unit ?? s.unit_snapshot,
                  unit_price: product?.base_price ? String(product.base_price) : s.unit_price,
                  category_name_snapshot: product?.category_id ? categoryLookup.get(product.category_id) ?? s.category_name_snapshot : s.category_name_snapshot,
                  brand_name_snapshot: product?.brand_id ? brandLookup.get(product.brand_id) ?? s.brand_name_snapshot : s.brand_name_snapshot
                }));
              }} required>
                <option value="">Select product</option>
                {filteredProducts.map((product: any) => <option key={product.id} value={product.id}>{product.item_name} {product.sku ? `(${product.sku})` : ""}</option>)}
              </select>
            </label>
            <label>
              Item name snapshot
              <input value={form.item_name_snapshot} onChange={(e) => setForm((s) => ({ ...s, item_name_snapshot: e.target.value }))} required />
            </label>
            <label>
              Quantity required
              <input type="number" value={form.quantity_required} onChange={(e) => setForm((s) => ({ ...s, quantity_required: e.target.value }))} required />
            </label>
            <label>
              Unit price
              <input type="number" value={form.unit_price} onChange={(e) => setForm((s) => ({ ...s, unit_price: e.target.value }))} />
            </label>
            <label>
              Approval mode
              <select value={form.approval_mode} onChange={(e) => setForm((s) => ({ ...s, approval_mode: e.target.value }))}>
                <option value="architect_then_customer">Architect then customer</option>
                <option value="customer_only">Customer only</option>
              </select>
            </label>
            <label>
              Unit
              <input value={form.unit_snapshot} onChange={(e) => setForm((s) => ({ ...s, unit_snapshot: e.target.value }))} required />
            </label>
          </FormGrid>
          <label>
            Electrician notes
            <textarea value={form.electrician_notes} onChange={(e) => setForm((s) => ({ ...s, electrician_notes: e.target.value }))} />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={mutation.isSubmitting}>{mutation.isSubmitting ? "Saving..." : editingId ? "Update item" : "Create item"}</button>
            {editingId ? (
              <button type="button" className="secondary-button" onClick={() => {
                setEditingId(null);
                setForm({ site_id: "", site_order_id: "", category_id: "", brand_id: "", product_search: "", product_id: "", item_name_snapshot: "", unit_snapshot: "pcs", quantity_required: "", unit_price: "", category_name_snapshot: "", brand_name_snapshot: "", approval_mode: "architect_then_customer", electrician_notes: "" });
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
        title="Material tracker"
        description="This screen uses the electrician material tracker view and groups status-rich line items."
      >
        <QueryState
          loading={materials.loading}
          error={materials.error}
          hasData={materials.data.length > 0}
          empty={{
            title: "No material tracker data",
            description: "Create order items linked to an electrician-assigned site to populate this screen."
          }}
        >
          <CardGrid>
            {materials.data.map((item: any) => (
              <DataCard
                key={item.order_item_id}
                title={item.item_name_snapshot}
                subtitle={item.site_name}
                meta={item.status}
              >
                <p>Required: {item.quantity_required}</p>
                <p>Supplied: {item.quantity_supplied}</p>
                <p>Unit price: ₹{Number(item.unit_price ?? 0).toLocaleString("en-IN")}</p>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => {
                    setEditingId(item.order_item_id);
                    const matchedProduct = products.data.find((product: any) => product.id === item.product_id);
                    setForm({
                      site_id: item.site_id ?? "",
                      site_order_id: item.site_order_id ?? "",
                      category_id: matchedProduct?.category_id ?? "",
                      brand_id: matchedProduct?.brand_id ?? "",
                      product_search: "",
                      product_id: item.product_id ?? "",
                      item_name_snapshot: item.item_name_snapshot ?? "",
                      unit_snapshot: item.unit_snapshot ?? "pcs",
                      quantity_required: String(item.quantity_required ?? ""),
                      unit_price: String(item.unit_price ?? ""),
                      category_name_snapshot: item.category_name_snapshot ?? "",
                      brand_name_snapshot: item.brand_name_snapshot ?? "",
                      approval_mode: item.approval_mode ?? "architect_then_customer",
                      electrician_notes: item.electrician_notes ?? ""
                    });
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

export function ArchitectDashboardPage() {
  const { profile } = useAuth();
  const architectId = profile?.id ?? "";
  const ongoing = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_architect_ongoing_projects")
        .select("*")
        .eq("architect_id", architectId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [architectId]
  );
  const newProjects = useRows(
    async (client) => {
      const { data, error } = await client.from("vw_architect_new_projects").select("*");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Open projects", value: newProjects.data.length },
          { label: "Ongoing projects", value: ongoing.data.length },
          { label: "Customer pending items", value: ongoing.data.reduce((sum, row: any) => sum + Number(row.customer_pending_items ?? 0), 0) },
          { label: "Supplied items", value: ongoing.data.reduce((sum, row: any) => sum + Number(row.supplied_items ?? 0), 0) }
        ]}
      />
      <PageSection
        title="Architect review flow"
        description="Architect pages read directly from project and material review views."
      >
        <QueryState
          loading={ongoing.loading}
          error={ongoing.error}
          hasData={ongoing.data.length > 0}
          empty={{
            title: "No architect-assigned projects",
            description: "Assign an architect to a site to see it appear here."
          }}
        >
          <CardGrid>
            {ongoing.data.map((project: any) => (
              <DataCard
                key={project.site_id}
                title={project.site_name}
                subtitle={project.customer_name}
                meta={project.site_status}
              >
                <p>Electrician: {project.electrician_name ?? "-"}</p>
                <p>Awaiting customer: {project.customer_pending_items}</p>
                <p>Awaiting supply: {project.supply_pending_items}</p>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function ArchitectProjectsPage({ mode }: { mode: "new" | "ongoing" }) {
  const { profile } = useAuth();
  const architectId = profile?.id ?? "";
  const query = useRows(
    async (client) => {
      if (mode === "new") {
        const { data, error } = await client.from("vw_architect_new_projects").select("*");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      const { data, error } = await client
        .from("vw_architect_ongoing_projects")
        .select("*")
        .eq("architect_id", architectId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [mode, architectId]
  );

  return (
    <PageSection
      title={mode === "new" ? "New architect projects" : "Ongoing architect projects"}
      description="Projects are sourced from architect-specific database views."
    >
      <QueryState
        loading={query.loading}
        error={query.error}
        hasData={query.data.length > 0}
        empty={{
          title: "No project data",
          description: "Rows will appear here as soon as the underlying view returns records."
        }}
      >
        <DataTable
          columns={
            mode === "new"
              ? ["Site", "Project Type", "City", "Budget", "Status"]
              : ["Site", "Customer", "Status", "Requested by Electrician", "Customer Pending", "Supplied"]
          }
          rows={
            mode === "new"
              ? query.data.map((row: any) => [
                  row.site_name,
                  row.project_type,
                  row.city,
                  row.estimated_budget ? `₹${Number(row.estimated_budget).toLocaleString("en-IN")}` : "-",
                  row.status
                ])
              : query.data.map((row: any) => [
                  row.site_name,
                  row.customer_name,
                  row.site_status,
                  row.electrician_requested_items,
                  row.customer_pending_items,
                  row.supplied_items
                ])
          }
        />
      </QueryState>
    </PageSection>
  );
}

export function ArchitectMaterialsPage() {
  const { profile } = useAuth();
  const architectId = profile?.id ?? "";
  const materials = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_architect_material_tracker")
        .select("*")
        .eq("architect_id", architectId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [architectId]
  );

  const mutation = useMutationAction();

  async function reviewItem(orderItemId: string, approve: boolean) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(async () => client.rpc("review_order_item_by_architect", {
      target_order_item_id: orderItemId,
      approve,
      note_text: approve ? "Approved by architect" : "Rejected by architect"
    }), approve ? "Item approved by architect." : "Item rejected by architect.");
    if (ok) materials.refetch?.();
  }

  return (
    <PageSection
      title="Architect material tracker"
      description="Material review and approval states are sourced directly from the architect tracker view."
    >
      <QueryState
        loading={materials.loading}
        error={materials.error}
        hasData={materials.data.length > 0}
        empty={{
          title: "No material tracker records",
          description: "Add order items to architect-associated sites to populate this view."
        }}
      >
        <FormNotice error={mutation.error} success={mutation.success} />
        <CardGrid>
          {materials.data.map((item: any) => (
            <DataCard
              key={item.order_item_id}
              title={item.item_name_snapshot}
              subtitle={item.site_name}
              meta={item.status}
            >
              <p>Required: {item.quantity_required}</p>
              <p>Approved: {item.quantity_approved ?? "-"}</p>
              <p>Supplied: {item.quantity_supplied}</p>
              {item.status === "pending_architect_approval" ? (
                <div className="inline-actions">
                  <button type="button" className="primary-button" disabled={mutation.isSubmitting} onClick={() => void reviewItem(item.order_item_id, true)}>Approve</button>
                  <button type="button" className="secondary-button" disabled={mutation.isSubmitting} onClick={() => void reviewItem(item.order_item_id, false)}>Reject</button>
                </div>
              ) : null}
            </DataCard>
          ))}
        </CardGrid>
      </QueryState>
    </PageSection>
  );
}

export function AdminDashboardPage() {
  const users = useRows(
    async (client) => {
      const { data, error } = await client.from("users").select("role, verification_status");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const orders = useRows(
    async (client) => {
      const { data, error } = await client.from("site_orders").select("status");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const substitutions = useRows(
    async (client) => {
      const { data, error } = await client.from("substitute_suggestions").select("status");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const products = useRows(
    async (client) => {
      const { data, error } = await client.from("products").select("stock_status");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const assignments = useRows(
    async (client) => {
      const { data, error } = await client.from("site_assignments").select("status");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const requests = useRows(
    async (client) => {
      const { data, error } = await client.from("product_requests").select("status");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const notes = useRows(
    async (client) => {
      const { data, error } = await client.from("site_notes").select("id");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Users", value: users.data.length },
          { label: "Orders", value: orders.data.length },
          { label: "Substitutions", value: substitutions.data.length },
          { label: "Products", value: products.data.length },
          { label: "Assignments", value: assignments.data.length },
          { label: "Product requests", value: requests.data.length },
          { label: "Notes", value: notes.data.length }
        ]}
      />
      <PageSection
        title="Admin operations overview"
        description="This dashboard is sourced from core admin tables in the database."
      >
        <CardGrid>
          <DataCard
            title="Verification pending"
            meta="users"
            subtitle="Professionals waiting to be approved"
          >
            <p>
              {
                users.data.filter((user: any) => user.verification_status === "pending").length
              } records
            </p>
          </DataCard>
          <DataCard title="Orders awaiting work" meta="orders">
            <p>
              {
                orders.data.filter((order: any) =>
                  ["draft", "awaiting_approval", "processing"].includes(order.status)
                ).length
              } records
            </p>
          </DataCard>
          <DataCard title="Substitute actions" meta="substitutions">
            <p>
              {
                substitutions.data.filter((item: any) => item.status === "suggested").length
              } pending decisions
            </p>
          </DataCard>
          <DataCard title="Assignment coverage" meta="site_assignments">
            <p>
              {assignments.data.filter((item: any) => item.status === "active").length} active assignments
            </p>
          </DataCard>
          <DataCard title="Custom product requests" meta="product_requests">
            <p>
              {requests.data.filter((item: any) => ["submitted", "reviewing", "matched"].includes(item.status)).length} open requests
            </p>
          </DataCard>
          <DataCard title="Collaboration notes" meta="site_notes">
            <p>{notes.data.length} notes logged across projects</p>
          </DataCard>
        </CardGrid>
      </PageSection>
    </div>
  );
}

export function AdminUsersPage() {
  const mutation = useMutationAction();
  const users = useRows(
    async (client) => {
      const { data, error } = await client
        .from("users")
        .select("id, full_name, email, phone, role, verification_status, is_admin_verified")
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  async function verifyUser(userId: string, approve: boolean) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(async () => client.rpc("verify_professional_user", {
      target_user_id: userId,
      approve,
      admin_note: approve ? "Verified from admin panel" : "Rejected from admin panel"
    }), approve ? "Professional verified." : "Professional rejected.");
    if (ok) users.refetch?.();
  }

  return (
    <PageSection
      title="Users and verification"
      description="Admin can review customer, electrician, architect, and admin records here."
    >
      <QueryState
        loading={users.loading}
        error={users.error}
        hasData={users.data.length > 0}
        empty={{ title: "No users found", description: "Create auth users and public user profiles to populate this page." }}
      >
        <FormNotice error={mutation.error} success={mutation.success} />
        <CardGrid>
          {users.data.map((user: any) => (
            <DataCard key={user.id} title={user.full_name ?? "-"} subtitle={user.email ?? user.phone} meta={user.role}>
              <p>Verification: {user.verification_status}</p>
              <p>Admin verified: {user.is_admin_verified ? "Yes" : "No"}</p>
              {["electrician", "architect"].includes(user.role) ? (
                <div className="inline-actions">
                  <button type="button" className="primary-button" disabled={mutation.isSubmitting} onClick={() => void verifyUser(user.id, true)}>Verify</button>
                  <button type="button" className="secondary-button" disabled={mutation.isSubmitting} onClick={() => void verifyUser(user.id, false)}>Reject</button>
                </div>
              ) : null}
            </DataCard>
          ))}
        </CardGrid>
      </QueryState>
    </PageSection>
  );
}

export function AdminOrdersPage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    site_id: "",
    order_number: "",
    customer_id: "",
    electrician_id: "",
    architect_id: "",
    status: "draft",
    total_amount: ""
  });
  const mutation = useMutationAction();
  const sites = useRows(async (client) => {
    const { data, error } = await client.from("sites").select("id, site_name, customer_id");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const users = useRows(async (client) => {
    const { data, error } = await client.from("users").select("id, full_name, role");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const orders = useRows(
    async (client) => {
      const { data, error } = await client
        .from("site_orders")
        .select("id, site_id, order_number, customer_id, electrician_id, architect_id, status, total_amount, confirmed_at, supplied_at")
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const orderItems = useRows(async (client) => {
    const { data, error } = await client
      .from("order_items")
      .select("id, site_order_id, item_name_snapshot, quantity_required, quantity_supplied, status")
      .order("created_at", { ascending: false });
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);

  async function saveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const payload = {
      site_id: form.site_id,
      order_number: form.order_number,
      customer_id: form.customer_id,
      electrician_id: form.electrician_id || null,
      architect_id: form.architect_id || null,
      status: form.status,
      subtotal_amount: Number(form.total_amount || 0),
      total_amount: Number(form.total_amount || 0)
    };
    const ok = await mutation.run(async () => {
      if (editingId) return client.from("site_orders").update(payload).eq("id", editingId);
      return client.from("site_orders").insert(payload);
    }, editingId ? "Order updated." : "Order created.");
    if (ok) {
      setEditingId(null);
      setForm({ site_id: "", order_number: "", customer_id: "", electrician_id: "", architect_id: "", status: "draft", total_amount: "" });
      orders.refetch?.();
    }
  }

  async function markSupplied(orderItemId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(async () => client.rpc("mark_order_item_supplied", {
      target_order_item_id: orderItemId,
      supplied_qty: 999999,
      note_text: "Marked supplied from admin panel"
    }), "Order item marked as supplied.");
    if (ok) {
      orders.refetch?.();
      orderItems.refetch?.();
    }
  }

  return (
    <div className="page-stack">
    <FormCard title={editingId ? "Edit order" : "Create order"} description="Admin can manage order headers used by material line items.">
      <form onSubmit={saveOrder} className="auth-form">
        <FormGrid>
          <label>
            Site
            <select value={form.site_id} onChange={(e) => {
              const site = sites.data.find((row: any) => row.id === e.target.value);
              setForm((s) => ({ ...s, site_id: e.target.value, customer_id: site?.customer_id ?? s.customer_id }));
            }} required>
              <option value="">Select site</option>
              {sites.data.map((site: any) => <option key={site.id} value={site.id}>{site.site_name}</option>)}
            </select>
          </label>
          <label>
            Order number
            <input value={form.order_number} onChange={(e) => setForm((s) => ({ ...s, order_number: e.target.value }))} required />
          </label>
          <label>
            Customer
            <select value={form.customer_id} onChange={(e) => setForm((s) => ({ ...s, customer_id: e.target.value }))} required>
              <option value="">Select customer</option>
              {users.data.filter((u: any) => u.role === "customer").map((user: any) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
          <label>
            Electrician
            <select value={form.electrician_id} onChange={(e) => setForm((s) => ({ ...s, electrician_id: e.target.value }))}>
              <option value="">Select electrician</option>
              {users.data.filter((u: any) => u.role === "electrician").map((user: any) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
          <label>
            Architect
            <select value={form.architect_id} onChange={(e) => setForm((s) => ({ ...s, architect_id: e.target.value }))}>
              <option value="">Select architect</option>
              {users.data.filter((u: any) => u.role === "architect").map((user: any) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
          <label>
            Status
            <select value={form.status} onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}>
              <option value="draft">draft</option>
              <option value="awaiting_approval">awaiting_approval</option>
              <option value="confirmed">confirmed</option>
              <option value="processing">processing</option>
              <option value="supplied">supplied</option>
            </select>
          </label>
          <label>
            Total amount
            <input type="number" value={form.total_amount} onChange={(e) => setForm((s) => ({ ...s, total_amount: e.target.value }))} />
          </label>
        </FormGrid>
        <div className="form-actions">
          <button className="primary-button" disabled={mutation.isSubmitting}>{mutation.isSubmitting ? "Saving..." : editingId ? "Update order" : "Create order"}</button>
        </div>
        <FormNotice error={mutation.error} success={mutation.success} />
      </form>
    </FormCard>
    <PageSection title="Orders" description="Confirmed and in-progress orders from the core orders table.">
      <QueryState
        loading={orders.loading}
        error={orders.error}
        hasData={orders.data.length > 0}
        empty={{ title: "No orders found", description: "Order records will appear here when site orders are inserted." }}
      >
        <CardGrid>
          {orders.data.map((order: any) => (
            <DataCard key={order.id} title={order.order_number} subtitle={order.status} meta={`₹${Number(order.total_amount ?? 0).toLocaleString("en-IN")}`}>
              <p>Confirmed: {order.confirmed_at ? new Date(order.confirmed_at).toLocaleDateString() : "-"}</p>
              <p>Supplied: {order.supplied_at ? new Date(order.supplied_at).toLocaleDateString() : "-"}</p>
              <div className="inline-actions">
                <button type="button" className="secondary-button" onClick={() => {
                  setEditingId(order.id);
                  setForm({
                    site_id: order.site_id ?? "",
                    order_number: order.order_number ?? "",
                    customer_id: order.customer_id ?? "",
                    electrician_id: order.electrician_id ?? "",
                    architect_id: order.architect_id ?? "",
                    status: order.status ?? "draft",
                    total_amount: String(order.total_amount ?? "")
                  });
                  mutation.reset();
                }}>Edit</button>
              </div>
            </DataCard>
          ))}
        </CardGrid>
      </QueryState>
    </PageSection>
    <PageSection title="Order item supply actions" description="Admins can mark individual line items as supplied from here.">
      <QueryState
        loading={orderItems.loading}
        error={orderItems.error}
        hasData={orderItems.data.length > 0}
        empty={{ title: "No order items found", description: "Create material line items to manage supply actions here." }}
      >
        <CardGrid>
          {orderItems.data.map((item: any) => (
            <DataCard key={item.id} title={item.item_name_snapshot} subtitle={`Required ${item.quantity_required}`} meta={item.status}>
              <p>Supplied: {item.quantity_supplied}</p>
              {item.status !== "supplied" ? (
                <div className="inline-actions">
                  <button type="button" className="primary-button" disabled={mutation.isSubmitting} onClick={() => void markSupplied(item.id)}>
                    Mark supplied
                  </button>
                </div>
              ) : null}
            </DataCard>
          ))}
        </CardGrid>
      </QueryState>
    </PageSection>
    </div>
  );
}

export function AdminProductsPage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    category_id: "",
    brand_id: "",
    item_name: "",
    sku: "",
    unit: "pcs",
    base_price: "",
    stock_status: "in_stock",
    image_url: ""
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const mutation = useMutationAction();
  const categories = useRows(async (client) => {
    const { data, error } = await client.from("product_categories").select("id, name").order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const brands = useRows(async (client) => {
    const { data, error } = await client.from("product_brands").select("id, name, category_id").order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const products = useRows(
    async (client) => {
      const { data, error } = await client
        .from("products")
        .select("id, category_id, brand_id, item_name, sku, unit, base_price, stock_status, image_url")
        .order("item_name", { ascending: true });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const [productSearch, setProductSearch] = useState("");
  const filteredBrands = useMemo(
    () => brands.data.filter((brand: any) => !form.category_id || brand.category_id === form.category_id),
    [brands.data, form.category_id]
  );
  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products.data;
    return products.data.filter((product: any) =>
      [product.item_name, product.sku].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [products.data, productSearch]);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const payload = {
      category_id: form.category_id,
      brand_id: form.brand_id,
      item_name: form.item_name,
      sku: form.sku,
      unit: form.unit,
      base_price: Number(form.base_price || 0),
      stock_status: form.stock_status,
      image_url: form.image_url || null
    };
    const ok = await mutation.run(async () => {
      const result = editingId
        ? await client
            .from("products")
            .update(payload)
            .eq("id", editingId)
            .select("id, sku")
            .single()
        : await client
            .from("products")
            .insert(payload)
            .select("id, sku")
            .single();

      if (result.error || !imageFile) {
        return result;
      }

      const uploadFormData = new FormData();
      uploadFormData.append("file", imageFile);
      uploadFormData.append("productId", result.data.id);
      uploadFormData.append("productSku", result.data.sku ?? form.sku);

      const uploadResponse = await fetch("/api/admin/upload-product-image", {
        method: "POST",
        body: uploadFormData
      });

      const uploadData = (await uploadResponse.json()) as {
        error?: string;
        url?: string;
      };

      if (!uploadResponse.ok || !uploadData.url) {
        return {
          error: {
            message: uploadData.error ?? "Image upload failed."
          }
        };
      }

      return client
        .from("products")
        .update({ image_url: uploadData.url })
        .eq("id", result.data.id);
    }, editingId ? "Product updated." : "Product created.");
    if (ok) {
      setEditingId(null);
      setImageFile(null);
      setForm({ category_id: "", brand_id: "", item_name: "", sku: "", unit: "pcs", base_price: "", stock_status: "in_stock", image_url: "" });
      products.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <FormCard title={editingId ? "Edit product" : "Create product"} description="Admins can maintain the live catalog directly from the frontend.">
        <form onSubmit={saveProduct} className="auth-form">
          <FormGrid>
            <label>
              Category
              <select value={form.category_id} onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value, brand_id: "" }))} required>
                <option value="">Select category</option>
                {categories.data.map((category: any) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>
              Brand
              <select value={form.brand_id} onChange={(e) => setForm((s) => ({ ...s, brand_id: e.target.value }))} required>
                <option value="">Select brand</option>
                {filteredBrands.map((brand: any) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
              </select>
            </label>
            <label>
              Item name
              <input value={form.item_name} onChange={(e) => setForm((s) => ({ ...s, item_name: e.target.value }))} required />
            </label>
            <label>
              SKU
              <input value={form.sku} onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))} required />
            </label>
            <label>
              Unit
              <input value={form.unit} onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))} required />
            </label>
            <label>
              Base price
              <input type="number" value={form.base_price} onChange={(e) => setForm((s) => ({ ...s, base_price: e.target.value }))} />
            </label>
            <label>
              Stock status
              <select value={form.stock_status} onChange={(e) => setForm((s) => ({ ...s, stock_status: e.target.value }))}>
                <option value="in_stock">In stock</option>
                <option value="limited">Limited</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </label>
          </FormGrid>
          <label>
            Product image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {form.image_url ? (
            <div className="product-media">
              <img src={form.image_url} alt={form.item_name || "Product image"} />
            </div>
          ) : null}
          <div className="form-actions">
            <button className="primary-button" disabled={mutation.isSubmitting}>{mutation.isSubmitting ? "Saving..." : editingId ? "Update product" : "Create product"}</button>
            {editingId ? (
              <button type="button" className="secondary-button" onClick={() => {
                setEditingId(null);
                setImageFile(null);
                setForm({ category_id: "", brand_id: "", item_name: "", sku: "", unit: "pcs", base_price: "", stock_status: "in_stock", image_url: "" });
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
        title="Products and inventory"
        description="The product catalog and stock flags are fetched directly from the products table."
      >
        <div className="catalog-search-row">
          <input
            className="catalog-search-input"
            placeholder="Search products by item name or SKU"
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
          />
        </div>
        <QueryState
          loading={products.loading}
          error={products.error}
          hasData={visibleProducts.length > 0}
          empty={{ title: "No products found", description: "Add product catalog records to populate this screen." }}
        >
          <CardGrid>
            {visibleProducts.map((product: any) => (
              <DataCard key={product.id} title={product.item_name} subtitle={product.sku} meta={product.stock_status}>
                {product.image_url ? (
                  <div className="product-media">
                    <img src={product.image_url} alt={product.item_name} />
                  </div>
                ) : null}
                <p>Unit: {product.unit}</p>
                <p>Base price: ₹{Number(product.base_price ?? 0).toLocaleString("en-IN")}</p>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => {
                    setEditingId(product.id);
                    setImageFile(null);
                    setForm({
                      category_id: product.category_id ?? "",
                      brand_id: product.brand_id ?? "",
                      item_name: product.item_name ?? "",
                      sku: product.sku ?? "",
                      unit: product.unit ?? "pcs",
                      base_price: String(product.base_price ?? ""),
                      stock_status: product.stock_status ?? "in_stock",
                      image_url: product.image_url ?? ""
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

export function AdminSubstitutionsPage() {
  const mutation = useMutationAction();
  const orderItems = useRows(async (client) => {
    const { data, error } = await client.from("order_items").select("id, item_name_snapshot");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const products = useRows(async (client) => {
    const { data, error } = await client.from("products").select("id, item_name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const [form, setForm] = useState({ original_order_item_id: "", suggested_product_id: "", reason: "" });
  const substitutions = useRows(
    async (client) => {
      const { data, error } = await client
        .from("substitute_suggestions")
        .select("id, original_order_item_id, status, reason, customer_response_at, created_at")
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  async function saveSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(async () => client.rpc("suggest_substitute_item", {
      original_item_id: form.original_order_item_id,
      suggested_product: form.suggested_product_id,
      reason_text: form.reason || null
    }), "Substitute suggested successfully.");
    if (ok) {
      setForm({ original_order_item_id: "", suggested_product_id: "", reason: "" });
      substitutions.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <FormCard title="Suggest substitute" description="Admins can send substitute suggestions directly from the app.">
        <form onSubmit={saveSuggestion} className="auth-form">
          <FormGrid>
            <label>
              Original order item
              <select value={form.original_order_item_id} onChange={(e) => setForm((s) => ({ ...s, original_order_item_id: e.target.value }))} required>
                <option value="">Select item</option>
                {orderItems.data.map((item: any) => <option key={item.id} value={item.id}>{item.item_name_snapshot}</option>)}
              </select>
            </label>
            <label>
              Suggested product
              <select value={form.suggested_product_id} onChange={(e) => setForm((s) => ({ ...s, suggested_product_id: e.target.value }))} required>
                <option value="">Select product</option>
                {products.data.map((product: any) => <option key={product.id} value={product.id}>{product.item_name}</option>)}
              </select>
            </label>
          </FormGrid>
          <label>
            Reason
            <textarea value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={mutation.isSubmitting}>{mutation.isSubmitting ? "Saving..." : "Suggest substitute"}</button>
          </div>
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>
      <PageSection
        title="Substitutions"
        description="Admin substitution suggestions and customer responses are shown here."
      >
        <QueryState
          loading={substitutions.loading}
          error={substitutions.error}
          hasData={substitutions.data.length > 0}
          empty={{ title: "No substitution records", description: "Substitute suggestion rows will appear here when created." }}
        >
          <DataTable
            columns={["Suggestion ID", "Original Item", "Status", "Reason", "Customer Response"]}
            rows={substitutions.data.map((item: any) => [
              item.id,
              item.original_order_item_id,
              item.status,
              item.reason ?? "-",
              item.customer_response_at ? new Date(item.customer_response_at).toLocaleDateString() : "-"
            ])}
          />
        </QueryState>
      </PageSection>
    </div>
  );
}

export function AdminContentPage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", slug: "", category: "electrical_tips", summary: "", body: "", is_published: false });
  const mutation = useMutationAction();
  const posts = useRows(
    async (client) => {
      const { data, error } = await client
        .from("content_posts")
        .select("id, title, category, is_published, published_at, slug, summary, body")
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  async function saveContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const payload = {
      title: form.title,
      slug: form.slug,
      category: form.category,
      summary: form.summary || null,
      body: form.body,
      is_published: form.is_published,
      published_at: form.is_published ? new Date().toISOString() : null
    };
    const ok = await mutation.run(async () => {
      if (editingId) return client.from("content_posts").update(payload).eq("id", editingId);
      return client.from("content_posts").insert(payload);
    }, editingId ? "Content updated." : "Content created.");
    if (ok) {
      setEditingId(null);
      setForm({ title: "", slug: "", category: "electrical_tips", summary: "", body: "", is_published: false });
      posts.refetch?.();
    }
  }

  return (
    <div className="page-stack">
      <FormCard title={editingId ? "Edit content" : "Create content"} description="Admin can manage customer educational content directly from the frontend.">
        <form onSubmit={saveContent} className="auth-form">
          <FormGrid>
            <label>
              Title
              <input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} required />
            </label>
            <label>
              Slug
              <input value={form.slug} onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value }))} required />
            </label>
            <label>
              Category
              <select value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}>
                <option value="electrical_tips">Electrical tips</option>
                <option value="home_tips">Home tips</option>
              </select>
            </label>
            <label>
              Publish now
              <select value={form.is_published ? "yes" : "no"} onChange={(e) => setForm((s) => ({ ...s, is_published: e.target.value === "yes" }))}>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </FormGrid>
          <label>
            Summary
            <textarea value={form.summary} onChange={(e) => setForm((s) => ({ ...s, summary: e.target.value }))} />
          </label>
          <label>
            Body
            <textarea value={form.body} onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))} required />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={mutation.isSubmitting}>{mutation.isSubmitting ? "Saving..." : editingId ? "Update content" : "Create content"}</button>
          </div>
          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>
      <PageSection
        title="Tips content"
        description="Admin can track all educational content rows from the content table."
      >
        <QueryState
          loading={posts.loading}
          error={posts.error}
          hasData={posts.data.length > 0}
          empty={{ title: "No content posts", description: "Insert content rows to populate the customer tips pages." }}
        >
          <CardGrid>
            {posts.data.map((post: any) => (
              <DataCard key={post.slug} title={post.title} subtitle={post.category} meta={post.is_published ? "Published" : "Draft"}>
                <p>Slug: {post.slug}</p>
                <p>Published at: {post.published_at ? new Date(post.published_at).toLocaleDateString() : "-"}</p>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => {
                    setEditingId(post.id);
                    setForm({
                      title: post.title ?? "",
                      slug: post.slug ?? "",
                      category: post.category ?? "electrical_tips",
                      summary: post.summary ?? "",
                      body: post.body ?? "",
                      is_published: Boolean(post.is_published)
                    });
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
