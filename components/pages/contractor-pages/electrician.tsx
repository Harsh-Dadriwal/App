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
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import {
  COMMON_PRODUCT_UNITS,
  ELECTRICIAN_BID_STEPS,
  ELECTRICIAN_ORDER_ITEM_STEPS,
  matchesQuery
} from "./shared";
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
    [electricianId],
    { enabled: Boolean(electricianId) }
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
    [mode, electricianId],
    { enabled: mode !== "ongoing" || Boolean(electricianId) }
  );

  const titleMap = {
    new: "New projects",
    market: "Projects assigned to others",
    ongoing: "Ongoing projects"
  } as const;
  const [bidForm, setBidForm] = useState({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
  const [editingBidId, setEditingBidId] = useState<string | null>(null);
  const [bidCreateStep, setBidCreateStep] = useState(1);
  const [bidSearch, setBidSearch] = useState("");
  const mutation = useMutationAction();
  const myBids = useRows(async (client) => {
    const { data, error } = await client
      .from("project_bids")
      .select("id, site_id, bid_amount, estimated_days, notes, status")
      .eq("bidder_user_id", electricianId)
      .eq("bidder_role", "electrician")
      .order("submitted_at", { ascending: false });
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [electricianId], { enabled: Boolean(electricianId) });

  const visibleBids = useMemo(() => {
    const q = bidSearch.trim().toLowerCase();
    if (!q) return myBids.data;
    return myBids.data.filter((bid: any) =>
      [bid.site_id, bid.bid_amount, bid.status, bid.notes].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [myBids.data, bidSearch]);

  useEffect(() => {
    if (editingBidId) return;
    if (bidCreateStep >= 2 && (!bidForm.site_id || !bidForm.bid_amount.trim())) setBidCreateStep(1);
  }, [editingBidId, bidCreateStep, bidForm.site_id, bidForm.bid_amount]);

  async function saveBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBidId && bidCreateStep < 2) return;
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
      setBidCreateStep(1);
      setBidForm({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
      query.refetch?.();
      myBids.refetch?.();
    }
  }

  const siteNameById = useMemo(() => new Map(query.data.map((p: any) => [p.site_id, p.site_name])), [query.data]);

  return (
    <div className="page-stack">
      {mode === "new" ? (
        <FormCard
          title={editingBidId ? "Edit bid" : "Submit bid"}
          description={
            editingBidId
              ? "Update your offer on this project."
              : "Pick the open project first, then add amount and optional timeline—the same guided pattern as other forms in the app."
          }
        >
          <form onSubmit={saveBid} className="auth-form">
            {!editingBidId ? <FlowWizardSteps steps={ELECTRICIAN_BID_STEPS} currentStep={bidCreateStep} ariaLabel="Steps to submit a bid" /> : null}
            {editingBidId ? <FormSectionHeader title="Bid fields" lead={<>Adjust your offer, then save.</>} /> : null}

            {!editingBidId && bidCreateStep === 1 ? (
              <div className="wizard-step-body">
                <FormGrid>
                  <label>
                    Project site
                    <select value={bidForm.site_id} onChange={(e) => setBidForm((s) => ({ ...s, site_id: e.target.value }))} required autoFocus>
                      <option value="">Choose project…</option>
                      {query.data.map((project: any) => (
                        <option key={project.site_id} value={project.site_id}>
                          {project.site_name}
                        </option>
                      ))}
                    </select>
                    <FormFieldHint>Open projects you can bid on appear in this list.</FormFieldHint>
                  </label>
                  <label>
                    Bid amount (₹)
                    <input type="number" min={0} step="0.01" value={bidForm.bid_amount} onChange={(e) => setBidForm((s) => ({ ...s, bid_amount: e.target.value }))} required />
                  </label>
                </FormGrid>
                <div className="wizard-nav">
                  <button type="button" className="primary-button" disabled={!bidForm.site_id || !bidForm.bid_amount.trim()} onClick={() => setBidCreateStep(2)}>
                    Continue
                  </button>
                </div>
              </div>
            ) : null}

            {!editingBidId && bidCreateStep === 2 ? (
              <div className="wizard-step-body">
                <label>
                  Estimated days
                  <input type="number" min={0} value={bidForm.estimated_days} onChange={(e) => setBidForm((s) => ({ ...s, estimated_days: e.target.value }))} />
                  <FormFieldHint>Optional. Leave blank if timing is flexible.</FormFieldHint>
                </label>
                <label>
                  Notes
                  <textarea value={bidForm.notes} onChange={(e) => setBidForm((s) => ({ ...s, notes: e.target.value }))} placeholder="Scope, exclusions, or assumptions" />
                </label>
                <div className="wizard-nav">
                  <button type="button" className="secondary-button" onClick={() => setBidCreateStep(1)}>
                    Back
                  </button>
                  <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                    {mutation.isSubmitting ? "Submitting..." : "Submit bid"}
                  </button>
                </div>
              </div>
            ) : null}

            {editingBidId ? (
              <>
                <FormGrid>
                  <label>
                    Site
                    <select value={bidForm.site_id} onChange={(e) => setBidForm((s) => ({ ...s, site_id: e.target.value }))} required>
                      <option value="">Select project</option>
                      {query.data.map((project: any) => (
                        <option key={project.site_id} value={project.site_id}>
                          {project.site_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bid amount (₹)
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
                  <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                    {mutation.isSubmitting ? "Saving..." : "Update bid"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingBidId(null);
                      setBidCreateStep(1);
                      setBidForm({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
                      mutation.reset();
                    }}
                  >
                    Cancel edit
                  </button>
                </div>
              </>
            ) : null}
            <FormNotice error={mutation.error} success={mutation.success} />
          </form>
        </FormCard>
      ) : null}
      {mode === "new" ? (
        <PageSection title="My bids" description="Search by site, amount, or status. Edit any bid you submitted.">
          <QueryState
            loading={myBids.loading}
            error={myBids.error}
            hasData={myBids.data.length > 0}
            empty={{ title: "No bids yet", description: "Submitted bids will appear here for quick edits." }}
          >
            <ListSearchField value={bidSearch} onChange={setBidSearch} placeholder="Search your bids" ariaLabel="Search bids" />
            <QueryState
              loading={false}
              error={null}
              hasData={visibleBids.length > 0}
              empty={{ title: "No matching bids", description: "Try another search or clear the filter." }}
            >
              <CardGrid>
                {visibleBids.map((bid: any) => (
                  <DataCard
                    key={bid.id}
                    title={siteNameById.get(bid.site_id) ?? bid.site_id}
                    subtitle={`₹${Number(bid.bid_amount ?? 0).toLocaleString("en-IN")}`}
                    meta={bid.status}
                  >
                    <p>Estimated days: {bid.estimated_days ?? "-"}</p>
                    <p>{bid.notes ?? "No notes added."}</p>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditingBidId(bid.id);
                          setBidCreateStep(1);
                          setBidForm({
                            site_id: bid.site_id ?? "",
                            bidder_role: "electrician",
                            bid_amount: String(bid.bid_amount ?? ""),
                            estimated_days: bid.estimated_days ? String(bid.estimated_days) : "",
                            notes: bid.notes ?? ""
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
  const [createStep, setCreateStep] = useState(1);
  const [materialSearch, setMaterialSearch] = useState("");
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
  }, [electricianId], { enabled: Boolean(electricianId) });
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
    [electricianId],
    { enabled: Boolean(electricianId) }
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
  const visibleMaterials = useMemo(() => {
    const q = materialSearch.trim().toLowerCase();
    if (!q) return materials.data;
    return materials.data.filter((item: any) =>
      [item.item_name_snapshot, item.site_name, item.status].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [materials.data, materialSearch]);
  const selectedProduct = useMemo(
    () => products.data.find((product: any) => product.id === form.product_id),
    [products.data, form.product_id]
  );
  const selectedSiteName = ongoingProjects.data.find((site: any) => site.site_id === form.site_id)?.site_name;
  const selectedOrderNumber = siteOrders.data.find((order: any) => order.id === form.site_order_id)?.order_number;
  const selectedCategoryName = form.category_id ? categoryLookup.get(form.category_id) : "";
  const selectedBrandName = form.brand_id ? brandLookup.get(form.brand_id) : "";
  const orderLineTotal = Number(form.quantity_required || 0) * Number(form.unit_price || 0);

  useEffect(() => {
    if (editingId) return;
    if (createStep >= 3 && (!form.site_id || !form.site_order_id)) setCreateStep(1);
    else if (createStep >= 4 && !form.category_id) setCreateStep(3);
    else if (createStep >= 5 && !form.brand_id) setCreateStep(4);
    else if (createStep >= 5 && !form.product_id) setCreateStep(4);
  }, [editingId, createStep, form.site_id, form.site_order_id, form.category_id, form.brand_id, form.product_id]);

  async function saveOrderItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId && createStep < 5) return;
    const client = await getSupabaseBrowserClient();
    if (!client || !electricianId) return;
    const basePayload = {
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
      electrician_notes: form.electrician_notes || null
    };
    const ok = await mutation.run(async () => {
      if (editingId) {
        return client.from("order_items").update(basePayload).eq("id", editingId);
      }
      return client.from("order_items").insert({
        ...basePayload,
        status: form.approval_mode === "architect_then_customer" ? "pending_architect_approval" : "pending_customer_approval"
      });
    }, editingId ? "Order item updated." : "Order item created.");
    if (ok) {
      setEditingId(null);
      setCreateStep(1);
      setForm({ site_id: "", site_order_id: "", category_id: "", brand_id: "", product_search: "", product_id: "", item_name_snapshot: "", unit_snapshot: "pcs", quantity_required: "", unit_price: "", category_name_snapshot: "", brand_name_snapshot: "", approval_mode: "architect_then_customer", electrician_notes: "" });
      materials.refetch?.();
    }
  }

  const emptyForm = {
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
  } as const;

  function resetOrderItemForm() {
    setEditingId(null);
    setCreateStep(1);
    setForm({ ...emptyForm });
    mutation.reset();
  }

  const isWizard = !editingId;

  return (
    <div className="page-stack">
      <FormCard
        title={editingId ? "Edit order item" : "Add material line"}
        description={
          editingId
            ? "Update this line on the order. The same fields are used as when you first added it."
            : "Step through: pick your site and order, then category, brand, and product—same guided order as admin catalog tools."
        }
      >
        <form onSubmit={saveOrderItem} className="auth-form">
          {!editingId ? (
            <div className="order-builder-hero">
              <div>
                <span className="eyebrow">Guided Order Builder</span>
                <h3>Find the exact material fast, then send it for approval.</h3>
                <p>
                  Choose site, category, brand, and product in sequence so the list stays short and mistakes are reduced.
                </p>
              </div>
              <div className="order-builder-snapshot">
                <span>{selectedSiteName ?? "No site selected"}</span>
                <strong>{selectedProduct?.item_name ?? (form.item_name_snapshot || "Choose product")}</strong>
                <small>
                  {selectedOrderNumber ?? "No order"} {orderLineTotal ? `• ₹${orderLineTotal.toLocaleString("en-IN")}` : ""}
                </small>
              </div>
            </div>
          ) : null}
          {isWizard ? <FlowWizardSteps steps={ELECTRICIAN_ORDER_ITEM_STEPS} currentStep={createStep} ariaLabel="Steps to add a material line" /> : null}
          {editingId ? (
            <FormSectionHeader title="Line item fields" lead={<>Adjust any value, then save.</>} />
          ) : null}

          {isWizard && createStep === 1 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Site
                  <select
                    value={form.site_id}
                    onChange={(e) => setForm((s) => ({ ...s, site_id: e.target.value, site_order_id: "" }))}
                    required
                    autoFocus
                  >
                    <option value="">Choose site…</option>
                    {ongoingProjects.data.map((site: any) => (
                      <option key={site.site_id} value={site.site_id}>
                        {site.site_name}
                      </option>
                    ))}
                  </select>
                  <FormFieldHint>Only sites where you are the assigned electrician appear here.</FormFieldHint>
                </label>
                <label>
                  Order
                  <select
                    value={form.site_order_id}
                    onChange={(e) => setForm((s) => ({ ...s, site_order_id: e.target.value }))}
                    required
                    disabled={!form.site_id}
                  >
                    <option value="">{form.site_id ? "Choose order…" : "Pick a site first"}</option>
                    {filteredOrders.map((order: any) => (
                      <option key={order.id} value={order.id}>
                        {order.order_number}
                      </option>
                    ))}
                  </select>
                  <FormFieldHint>Orders are filtered to the site you selected.</FormFieldHint>
                </label>
              </FormGrid>
              {!ongoingProjects.data.length && !ongoingProjects.loading ? (
                <div className="auth-footer-note">
                  <strong>No active sites</strong>
                  <p>You need an ongoing project assignment before you can add materials.</p>
                </div>
              ) : null}
              <div className="wizard-nav">
                <button
                  type="button"
                  className="primary-button"
                  disabled={!form.site_id || !form.site_order_id}
                  onClick={() => setCreateStep(2)}
                >
                  Continue to category
                </button>
              </div>
            </div>
          ) : null}

          {isWizard && createStep === 2 ? (
            <div className="wizard-step-body">
              <label>
                Category
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value, brand_id: "", product_id: "", product_search: "" }))}
                  required
                  autoFocus
                >
                  <option value="">Choose category…</option>
                  {categories.data.map((category: any) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <FormFieldHint>Choose the catalog group first so brand and product lists stay relevant.</FormFieldHint>
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setCreateStep(1)}>
                  Back
                </button>
                <button type="button" className="primary-button" disabled={!form.category_id} onClick={() => setCreateStep(3)}>
                  Continue to brand
                </button>
              </div>
            </div>
          ) : null}

          {isWizard && createStep === 3 ? (
            <div className="wizard-step-body">
              <label>
                Brand
                <select
                  value={form.brand_id}
                  onChange={(e) => setForm((s) => ({ ...s, brand_id: e.target.value, product_id: "", product_search: "" }))}
                  required
                  disabled={!form.category_id}
                  autoFocus
                >
                  <option value="">{form.category_id ? "Choose brand…" : "Pick a category first"}</option>
                  {filteredBrands.map((brand: any) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <FormFieldHint>Brands are limited to the category you chose.</FormFieldHint>
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setCreateStep(2)}>
                  Back
                </button>
                <button type="button" className="primary-button" disabled={!form.brand_id} onClick={() => setCreateStep(4)}>
                  Continue to product
                </button>
              </div>
            </div>
          ) : null}

          {isWizard && createStep === 4 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Search catalog
                  <input
                    value={form.product_search}
                    onChange={(e) => setForm((s) => ({ ...s, product_search: e.target.value, product_id: "" }))}
                    placeholder="Filter by item name or SKU"
                    autoFocus
                  />
                </label>
                <label>
                  Product
                  <select
                    value={form.product_id}
                    onChange={(e) => {
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
                    }}
                    required
                  >
                    <option value="">Choose product…</option>
                    {filteredProducts.map((product: any) => (
                      <option key={product.id} value={product.id}>
                        {product.item_name} {product.sku ? `(${product.sku})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </FormGrid>
              <FormFieldHint>
                Narrow the list with search, then pick the exact catalog row. Snapshots fill automatically for approvals.
              </FormFieldHint>
              <div className="product-choice-grid">
                {filteredProducts.slice(0, 8).map((product: any) => {
                  const selected = form.product_id === product.id;
                  return (
                    <button
                      type="button"
                      key={product.id}
                      className={selected ? "product-choice-card is-selected" : "product-choice-card"}
                      onClick={() =>
                        setForm((s) => ({
                          ...s,
                          product_id: product.id,
                          item_name_snapshot: product.item_name ?? s.item_name_snapshot,
                          unit_snapshot: product.unit ?? s.unit_snapshot,
                          unit_price: product.base_price ? String(product.base_price) : s.unit_price,
                          category_name_snapshot: product.category_id ? categoryLookup.get(product.category_id) ?? s.category_name_snapshot : s.category_name_snapshot,
                          brand_name_snapshot: product.brand_id ? brandLookup.get(product.brand_id) ?? s.brand_name_snapshot : s.brand_name_snapshot
                        }))
                      }
                    >
                      <span>{brandLookup.get(product.brand_id) ?? "Catalog"}</span>
                      <strong>{product.item_name}</strong>
                      <small>{product.sku ?? "No SKU"} • ₹{Number(product.base_price ?? 0).toLocaleString("en-IN")} / {product.unit ?? "unit"}</small>
                    </button>
                  );
                })}
              </div>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setCreateStep(3)}>
                  Back
                </button>
                <button type="button" className="primary-button" disabled={!form.product_id} onClick={() => setCreateStep(5)}>
                  Continue to quantities
                </button>
              </div>
            </div>
          ) : null}

          {isWizard && createStep === 5 ? (
            <div className="wizard-step-body">
              <div className="order-review-strip">
                <div>
                  <span>Site</span>
                  <strong>{selectedSiteName ?? "-"}</strong>
                </div>
                <div>
                  <span>Category</span>
                  <strong>{selectedCategoryName ?? "-"}</strong>
                </div>
                <div>
                  <span>Brand</span>
                  <strong>{selectedBrandName ?? "-"}</strong>
                </div>
                <div>
                  <span>Line total</span>
                  <strong>₹{orderLineTotal.toLocaleString("en-IN")}</strong>
                </div>
              </div>
              <FormGrid>
                <label>
                  Item name on order
                  <input value={form.item_name_snapshot} onChange={(e) => setForm((s) => ({ ...s, item_name_snapshot: e.target.value }))} required />
                </label>
                <label>
                  Quantity required
                  <input type="number" min={1} value={form.quantity_required} onChange={(e) => setForm((s) => ({ ...s, quantity_required: e.target.value }))} required />
                </label>
                <label>
                  Unit price (₹)
                  <input type="number" min={0} step="0.01" value={form.unit_price} onChange={(e) => setForm((s) => ({ ...s, unit_price: e.target.value }))} />
                </label>
                <label>
                  Unit
                  <input
                    value={form.unit_snapshot}
                    onChange={(e) => setForm((s) => ({ ...s, unit_snapshot: e.target.value }))}
                    list="electrician-order-unit-suggestions"
                    required
                  />
                  <datalist id="electrician-order-unit-suggestions">
                    {COMMON_PRODUCT_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Approval mode
                  <select value={form.approval_mode} onChange={(e) => setForm((s) => ({ ...s, approval_mode: e.target.value }))}>
                    <option value="architect_then_customer">Architect then customer</option>
                    <option value="customer_only">Customer only</option>
                  </select>
                </label>
              </FormGrid>
              <label>
                Notes for reviewers
                <textarea value={form.electrician_notes} onChange={(e) => setForm((s) => ({ ...s, electrician_notes: e.target.value }))} />
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setCreateStep(4)}>
                  Back
                </button>
                <button
                  className="primary-button"
                  disabled={mutation.isSubmitting || !form.item_name_snapshot.trim() || !form.quantity_required}
                  type="submit"
                >
                  {mutation.isSubmitting ? "Saving..." : "Save line item"}
                </button>
              </div>
            </div>
          ) : null}

          {editingId ? (
            <>
              <FormGrid>
                <label>
                  Site
                  <select value={form.site_id} onChange={(e) => setForm((s) => ({ ...s, site_id: e.target.value }))} required>
                    <option value="">Select site</option>
                    {ongoingProjects.data.map((site: any) => (
                      <option key={site.site_id} value={site.site_id}>
                        {site.site_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Order
                  <select value={form.site_order_id} onChange={(e) => setForm((s) => ({ ...s, site_order_id: e.target.value }))} required>
                    <option value="">Select order</option>
                    {filteredOrders.map((order: any) => (
                      <option key={order.id} value={order.id}>
                        {order.order_number}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value, brand_id: "", product_id: "", product_search: "" }))}
                    required
                  >
                    <option value="">Select category</option>
                    {categories.data.map((category: any) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Brand
                  <select
                    value={form.brand_id}
                    onChange={(e) => setForm((s) => ({ ...s, brand_id: e.target.value, product_id: "", product_search: "" }))}
                    required
                  >
                    <option value="">Select brand</option>
                    {filteredBrands.map((brand: any) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Search product
                  <input
                    value={form.product_search}
                    onChange={(e) => setForm((s) => ({ ...s, product_search: e.target.value, product_id: "" }))}
                    placeholder="Type item name or SKU"
                  />
                </label>
                <label>
                  Product
                  <select
                    value={form.product_id}
                    onChange={(e) => {
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
                    }}
                    required
                  >
                    <option value="">Select product</option>
                    {filteredProducts.map((product: any) => (
                      <option key={product.id} value={product.id}>
                        {product.item_name} {product.sku ? `(${product.sku})` : ""}
                      </option>
                    ))}
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
                  <input
                    value={form.unit_snapshot}
                    onChange={(e) => setForm((s) => ({ ...s, unit_snapshot: e.target.value }))}
                    list="electrician-order-unit-suggestions-edit"
                    required
                  />
                  <datalist id="electrician-order-unit-suggestions-edit">
                    {COMMON_PRODUCT_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </label>
              </FormGrid>
              <label>
                Electrician notes
                <textarea value={form.electrician_notes} onChange={(e) => setForm((s) => ({ ...s, electrician_notes: e.target.value }))} />
              </label>
              <div className="form-actions">
                <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Update item"}
                </button>
                <button type="button" className="secondary-button" onClick={resetOrderItemForm}>
                  Cancel edit
                </button>
              </div>
            </>
          ) : null}

          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>

      <PageSection
        title="Material tracker"
        description="Search your lines by name, site, or status. Same list layout as other roles use for their trackers."
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
          <ListSearchField
            value={materialSearch}
            onChange={setMaterialSearch}
            placeholder="Search by item, site, or status"
            ariaLabel="Search material lines"
          />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleMaterials.length > 0}
            empty={{
              title: "No matching lines",
              description: "Try a different search, or clear the filter to see everything."
            }}
          >
            <CardGrid>
              {visibleMaterials.map((item: any) => (
                <DataCard key={item.order_item_id} title={item.item_name_snapshot} subtitle={item.site_name} meta={item.status}>
                  <p>Required: {item.quantity_required}</p>
                  <p>Supplied: {item.quantity_supplied}</p>
                  <p>Unit price: ₹{Number(item.unit_price ?? 0).toLocaleString("en-IN")}</p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingId(item.order_item_id);
                        setCreateStep(1);
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
