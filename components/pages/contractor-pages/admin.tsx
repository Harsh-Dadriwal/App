"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { AdminWorkflowMonitor, OrderWorkflowTimeline } from "@/components/order-workflow";
import {
  CardGrid,
  DataCard,
  DataTable,
  FlowWizardSteps,
  FormCard,
  FormFieldHint,
  FormGrid,
  FormNotice,
  ListSearchField,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { getServeUrl } from "@/lib/s3";
import { roleLabels, type AppRole } from "@mahalaxmi/core/types/domain";
import {
  markOrderItemSupplied,
  suggestSubstituteItem,
  transitionSiteOrder,
  verifyProfessionalUser
} from "@/lib/backend/modules/workflow-gateway";
import {
  listInventoryProducts,
  listProductBrands,
  listProductCategories,
  saveInventoryProduct,
  updateProductImage
} from "@/lib/backend/modules/inventory-gateway";
import {
  ADMIN_MANAGED_USER_ROLES,
  ADMIN_PRODUCT_STEPS,
  COMMON_PRODUCT_UNITS
} from "./shared";
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
      <AdminWorkflowMonitor />
    </div>
  );
}

export function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const mutation = useMutationAction();
  const users = useRows(
    async (client) => {
      const { data, error } = await client
        .from("users")
        .select("id, username, full_name, email, phone, role, verification_status, is_admin_verified")
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return users.data;
    }

    return users.data.filter((user: any) =>
      [user.username, user.full_name, user.email, user.phone, roleLabels[user.role as AppRole] ?? user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [search, users.data]);

  async function setCreditLimit(userId: string, limit: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => client.from("users").update({ credit_limit: Number(limit), credit_balance: Number(limit) }).eq("id", userId),
      "Credit limit updated."
    );
    if (ok) users.refetch?.();
  }

  async function promoteUserRole(userId: string, newRole: AppRole) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => {
        const [userUpdate, membershipUpdate] = await Promise.all([
          client
            .from("users")
            .update({
              role: newRole,
              verification_status: "verified",
              is_admin_verified: true
            })
            .eq("id", userId),
          client
            .from("tenant_memberships")
            .update({ role: newRole })
            .eq("user_id", userId)
            .eq("is_active", true)
        ]);

        return {
          error: userUpdate.error ?? membershipUpdate.error ?? null
        };
      },
      `User role changed to ${newRole} successfully.`
    );
    if (ok) users.refetch?.();
  }

  async function verifyUser(userId: string, approve: boolean) {
    const ok = await mutation.run(async () => verifyProfessionalUser({
      target_user_id: userId,
      approve,
      admin_note: approve ? "Verified from admin panel" : "Rejected from admin panel"
    }), approve ? "Professional verified." : "Professional rejected.");
    if (ok) users.refetch?.();
  }

  return (
    <PageSection
      title="Users, verification & promotion"
      description="Admin can search every user, review usernames, and promote customers into any supported handyman or professional role."
    >
      <QueryState
        loading={users.loading}
        error={users.error}
        hasData={users.data.length > 0}
        empty={{ title: "No users found", description: "Create auth users and public user profiles to populate this page." }}
      >
        <FormNotice error={mutation.error} success={mutation.success} />
        <ListSearchField
          value={search}
          onChange={setSearch}
          placeholder="Search by username, full name, email, phone, or role"
          ariaLabel="Search users"
        />
        <QueryState
          loading={false}
          error={null}
          hasData={visibleUsers.length > 0}
          empty={{ title: "No users match", description: "Try another name, username, phone number, or clear the search." }}
        >
          <CardGrid>
            {visibleUsers.map((user: any) => (
              <DataCard key={user.id} title={user.full_name ?? "-"} subtitle={user.email ?? user.phone} meta={user.role}>
                <p>Username: {user.username ?? "-"}</p>
                <p>Verification: {user.verification_status}</p>
                <p>Admin verified: {user.is_admin_verified ? "Yes" : "No"}</p>
                {user.credit_limit !== undefined && (
                  <p>Credit: ₹{Number(user.credit_limit).toLocaleString("en-IN")}</p>
                )}
                <div className="inline-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  <label style={{ minWidth: 180 }}>
                    <span style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                      Promote or change role
                    </span>
                    <select
                      className="input"
                      value={user.role}
                      disabled={mutation.isSubmitting}
                      onChange={(event) => void promoteUserRole(user.id, event.target.value as AppRole)}
                    >
                      {ADMIN_MANAGED_USER_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {["electrician", "architect", "customer"].includes(user.role) && (
                    <button 
                      type="button" 
                      className="secondary-button" 
                      onClick={() => {
                        const limit = prompt("Enter credit limit for this user:", String(user.credit_limit || 0));
                        if (limit !== null) setCreditLimit(user.id, limit);
                      }}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    >
                      Set Credit
                    </button>
                  )}
                  {[
                    "electrician",
                    "architect",
                    "pop_man",
                    "carpenter",
                    "painter",
                    "tiles_man",
                    "plumber"
                  ].includes(user.role) && !user.is_admin_verified && (
                    <>
                      <button type="button" className="primary-button" disabled={mutation.isSubmitting} onClick={() => void verifyUser(user.id, true)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>Verify</button>
                      <button type="button" className="secondary-button" disabled={mutation.isSubmitting} onClick={() => void verifyUser(user.id, false)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>Reject</button>
                    </>
                  )}
                </div>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </QueryState>
    </PageSection>
  );
}

export function AdminOrdersPage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<string | null>(null);
  const [form, setForm] = useState({
    site_id: "",
    order_number: "",
    customer_id: "",
    electrician_id: "",
    architect_id: "",
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
      subtotal_amount: Number(form.total_amount || 0),
      total_amount: Number(form.total_amount || 0)
    };
    const ok = await mutation.run(async () => {
      if (editingId) return client.from("site_orders").update(payload).eq("id", editingId);
      return client.from("site_orders").insert({ ...payload, status: "draft" });
    }, editingId ? "Order updated." : "Order created.");
    if (ok) {
      setEditingId(null);
      setForm({ site_id: "", order_number: "", customer_id: "", electrician_id: "", architect_id: "", total_amount: "" });
      orders.refetch?.();
    }
  }

  async function markSupplied(orderItemId: string) {
    const ok = await mutation.run(async () => markOrderItemSupplied({
      target_order_item_id: orderItemId,
      supplied_qty: 999999,
      note_text: "Marked supplied from admin panel"
    }), "Order item marked as supplied.");
    if (ok) {
      orders.refetch?.();
      orderItems.refetch?.();
      setSelectedOrderItemId(orderItemId);
    }
  }

  async function transitionOrder(orderId: string, transitionKey: string, successMessage: string, noteText: string) {
    const ok = await mutation.run(
      async () => transitionSiteOrder({
        target_site_order_id: orderId,
        target_transition_key: transitionKey,
        note_text: noteText,
        event_payload: {},
        target_source_module: "admin_orders"
      }),
      successMessage
    );
    if (ok) {
      orders.refetch?.();
      setSelectedOrderId(orderId);
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
            Total amount
            <input type="number" value={form.total_amount} onChange={(e) => setForm((s) => ({ ...s, total_amount: e.target.value }))} />
            <FormFieldHint>Order status now moves through workflow transitions, not direct form edits.</FormFieldHint>
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
                    total_amount: String(order.total_amount ?? "")
                  });
                  mutation.reset();
                }}>Edit</button>
                <button type="button" className="secondary-button" onClick={() => setSelectedOrderId(order.id)}>
                  Timeline
                </button>
                {order.status === "confirmed" ? (
                  <button
                    type="button"
                    className="primary-button"
                    disabled={mutation.isSubmitting}
                    onClick={() => void transitionOrder(order.id, "admin_start_processing", "Order moved to processing.", "Moved into processing from admin orders.")}
                  >
                    Start processing
                  </button>
                ) : null}
                {["confirmed", "processing", "partially_supplied"].includes(order.status) ? (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={mutation.isSubmitting}
                    onClick={() => void transitionOrder(order.id, "admin_mark_supplied", "Order marked supplied.", "Closed from admin orders panel.")}
                  >
                    Mark supplied
                  </button>
                ) : null}
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
                  <button type="button" className="secondary-button" onClick={() => setSelectedOrderItemId(item.id)}>
                    Timeline
                  </button>
                </div>
              ) : (
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => setSelectedOrderItemId(item.id)}>
                    Timeline
                  </button>
                </div>
              )}
            </DataCard>
          ))}
        </CardGrid>
      </QueryState>
    </PageSection>
    <OrderWorkflowTimeline
      entityType="site_order"
      entityId={selectedOrderId}
      title="Selected order timeline"
      description="Header-level order transitions now flow through the same system event layer."
    />
    <OrderWorkflowTimeline
      entityType="order_item"
      entityId={selectedOrderItemId}
      title="Selected line-item timeline"
      description="Use this to inspect approvals, substitute actions, and supply updates for one material line."
    />
    </div>
  );
}

export function AdminProductsPage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createStep, setCreateStep] = useState(1);
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
  const categories = useRows(async () => {
    const result = await listProductCategories();
    return { data: result.data ?? [], error: result.error };
  }, []);
  const brands = useRows(async () => {
    const result = await listProductBrands();
    return { data: result.data ?? [], error: result.error };
  }, []);
  const products = useRows(
    async () => {
      const result = await listInventoryProducts();
      return { data: result.data ?? [], error: result.error };
    },
    []
  );
  const [productSearch, setProductSearch] = useState("");
  const filteredBrands = useMemo(
    () => brands.data.filter((brand: any) => !form.category_id || brand.category_id === form.category_id),
    [brands.data, form.category_id]
  );
  const categoryLookup = useMemo(
    () => new Map(categories.data.map((c: any) => [c.id, c.name] as const)),
    [categories.data]
  );
  const brandLookup = useMemo(
    () => new Map(brands.data.map((b: any) => [b.id, b.name] as const)),
    [brands.data]
  );
  const selectedCategoryName = form.category_id ? categoryLookup.get(form.category_id) : undefined;
  const selectedBrandName = form.brand_id ? brandLookup.get(form.brand_id) : undefined;
  const visibleProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products.data;
    return products.data.filter((product: any) =>
      [product.item_name, product.sku].some((value) => String(value ?? "").toLowerCase().includes(query))
    );
  }, [products.data, productSearch]);

  useEffect(() => {
    if (editingId) return;
    if (createStep === 2 && !form.category_id) setCreateStep(1);
    if (createStep >= 3 && (!form.category_id || !form.brand_id)) setCreateStep(form.category_id ? 2 : 1);
  }, [editingId, createStep, form.category_id, form.brand_id]);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const result = await saveInventoryProduct({
        editingId,
        payload
      });

      if (result.error || !imageFile || !result.data) {
        return { error: result.error };
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

      return updateProductImage(result.data.id, uploadData.url);
    }, editingId ? "Product updated." : "Product created.");
    if (ok) {
      setEditingId(null);
      setCreateStep(1);
      setImageFile(null);
      setForm({ category_id: "", brand_id: "", item_name: "", sku: "", unit: "pcs", base_price: "", stock_status: "in_stock", image_url: "" });
      products.refetch?.();
    }
  }

  function resetProductForm() {
    setEditingId(null);
    setCreateStep(1);
    setImageFile(null);
    setForm({ category_id: "", brand_id: "", item_name: "", sku: "", unit: "pcs", base_price: "", stock_status: "in_stock", image_url: "" });
    mutation.reset();
  }

  const isCreateWizard = !editingId;

  return (
    <div className="page-stack">
      <FormCard
        title={editingId ? "Edit product" : "Add a product"}
        description={
          editingId
            ? "Update catalog details below. Category and brand stay linked the same way as when the item was created."
            : "Follow the steps: pick category, then brand, then enter details. Categories and brands are managed under Catalog."
        }
      >
        <form onSubmit={saveProduct} className="auth-form">
          {isCreateWizard ? (
            <FlowWizardSteps steps={ADMIN_PRODUCT_STEPS} currentStep={createStep} ariaLabel="Steps to add a product" />
          ) : (
            <>
              <h3 className="form-section-title">Product fields</h3>
              <p className="form-section-lead">
                Adjust any value below. Use <strong>Categories &amp; Brands</strong> if you need new groups before saving.
              </p>
            </>
          )}

          {isCreateWizard && createStep === 1 ? (
            <div className="wizard-step-body">
              <label>
                Category
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value, brand_id: "" }))}
                  required
                  autoFocus
                >
                  <option value="">Choose a category…</option>
                  {categories.data.map((category: any) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <p className="form-field-hint">Start here so only relevant brands appear in the next step.</p>
              </label>
              {!categories.data.length && !categories.loading ? (
                <div className="auth-footer-note">
                  <strong>No categories yet</strong>
                  <p>
                    Create a category first on the{" "}
                    <Link href="/admin/catalog" className="form-inline-link">
                      Categories &amp; Brands
                    </Link>{" "}
                    page, then return here.
                  </p>
                </div>
              ) : null}
              <div className="wizard-nav">
                <button
                  type="button"
                  className="primary-button"
                  disabled={!form.category_id}
                  onClick={() => setCreateStep(2)}
                >
                  Continue to brand
                </button>
              </div>
            </div>
          ) : null}

          {isCreateWizard && createStep === 2 ? (
            <div className="wizard-step-body">
              <label>
                Brand
                <select
                  value={form.brand_id}
                  onChange={(e) => setForm((s) => ({ ...s, brand_id: e.target.value }))}
                  required
                  disabled={!form.category_id}
                  autoFocus
                >
                  <option value="">{form.category_id ? "Choose a brand…" : "Pick a category first"}</option>
                  {filteredBrands.map((brand: any) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
                <p className="form-field-hint">
                  Showing brands for <strong>{selectedCategoryName ?? "this category"}</strong>.
                  {filteredBrands.length === 0 && form.category_id ? (
                    <>
                      {" "}
                      None yet — add one under{" "}
                      <Link href="/admin/catalog" className="form-inline-link">
                        Categories &amp; Brands
                      </Link>
                      .
                    </>
                  ) : null}
                </p>
              </label>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setCreateStep(1)}>
                  Back
                </button>
                <button type="button" className="primary-button" disabled={!form.brand_id} onClick={() => setCreateStep(3)}>
                  Continue to details
                </button>
              </div>
            </div>
          ) : null}

          {isCreateWizard && createStep === 3 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Item name
                  <input
                    value={form.item_name}
                    onChange={(e) => setForm((s) => ({ ...s, item_name: e.target.value }))}
                    placeholder="e.g. 1.5 sq mm copper wire"
                    required
                    autoFocus
                  />
                </label>
                <label>
                  SKU / product code
                  <input
                    value={form.sku}
                    onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))}
                    placeholder="Unique code you use in orders"
                    required
                  />
                </label>
                <label>
                  Unit
                  <input
                    value={form.unit}
                    onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
                    list="product-units-suggestions"
                    placeholder="pcs, box, m…"
                    required
                  />
                  <datalist id="product-units-suggestions">
                    {COMMON_PRODUCT_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                  <p className="form-field-hint">How you count this item (pieces, metres, boxes, etc.).</p>
                </label>
              </FormGrid>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setCreateStep(2)}>
                  Back
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!form.item_name.trim() || !form.sku.trim() || !form.unit.trim()}
                  onClick={() => setCreateStep(4)}
                >
                  Continue to price &amp; photo
                </button>
              </div>
            </div>
          ) : null}

          {isCreateWizard && createStep === 4 ? (
            <div className="wizard-step-body">
              <FormGrid>
                <label>
                  Base price (₹)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.base_price}
                    onChange={(e) => setForm((s) => ({ ...s, base_price: e.target.value }))}
                    placeholder="0"
                  />
                  <p className="form-field-hint">Leave blank or 0 if price varies or is set later.</p>
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
                Product image (optional)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                />
                <p className="form-field-hint">PNG, JPEG, WebP, or AVIF. You can add or change this later when editing.</p>
              </label>
              {form.image_url ? (
                <div className="product-media">
                  <img src={getServeUrl(form.image_url)} alt={form.item_name || "Product image"} />
                </div>
              ) : null}
              <p className="form-field-hint" style={{ marginBottom: 0 }}>
                <strong>{selectedBrandName}</strong>
                {" · "}
                <strong>{selectedCategoryName}</strong>
                {" · "}
                {form.item_name || "Untitled item"} ({form.sku || "no SKU"})
              </p>
              <div className="wizard-nav">
                <button type="button" className="secondary-button" onClick={() => setCreateStep(3)}>
                  Back
                </button>
                <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Save product"}
                </button>
              </div>
            </div>
          ) : null}

          {editingId ? (
            <>
              <FormGrid>
                <label>
                  Category
                  <select
                    value={form.category_id}
                    onChange={(e) => setForm((s) => ({ ...s, category_id: e.target.value, brand_id: "" }))}
                    required
                  >
                    <option value="">Choose a category…</option>
                    {categories.data.map((category: any) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Brand
                  <select value={form.brand_id} onChange={(e) => setForm((s) => ({ ...s, brand_id: e.target.value }))} required>
                    <option value="">Choose a brand…</option>
                    {filteredBrands.map((brand: any) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Item name
                  <input value={form.item_name} onChange={(e) => setForm((s) => ({ ...s, item_name: e.target.value }))} required />
                </label>
                <label>
                  SKU / product code
                  <input value={form.sku} onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))} required />
                </label>
                <label>
                  Unit
                  <input
                    value={form.unit}
                    onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
                    list="product-units-suggestions-edit"
                    required
                  />
                  <datalist id="product-units-suggestions-edit">
                    {COMMON_PRODUCT_UNITS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Base price (₹)
                  <input type="number" min={0} step="0.01" value={form.base_price} onChange={(e) => setForm((s) => ({ ...s, base_price: e.target.value }))} />
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
                Replace product image
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif"
                  onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                />
              </label>
              {form.image_url ? (
                <div className="product-media">
                  <img src={getServeUrl(form.image_url)} alt={form.item_name || "Product image"} />
                </div>
              ) : null}
              <div className="form-actions">
                <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                  {mutation.isSubmitting ? "Saving..." : "Update product"}
                </button>
                <button type="button" className="secondary-button" onClick={resetProductForm}>
                  Cancel edit
                </button>
              </div>
            </>
          ) : null}

          <FormNotice error={mutation.error} success={mutation.success} />
        </form>
      </FormCard>
      <PageSection
        title="Products and inventory"
        description="Search by name or SKU. Each card shows category and brand for quick context."
      >
        <ListSearchField
          value={productSearch}
          onChange={setProductSearch}
          placeholder="Search by item name or SKU"
          ariaLabel="Search products by name or SKU"
        />
        <QueryState
          loading={products.loading}
          error={products.error}
          hasData={visibleProducts.length > 0}
          empty={{ title: "No products found in database", description: "Add product catalog records to the database to populate this screen." }}
        >
          <CardGrid>
            {visibleProducts.map((product: any) => (
              <DataCard
                key={product.id}
                title={product.item_name}
                subtitle={[product.sku, brandLookup.get(product.brand_id), categoryLookup.get(product.category_id)]
                  .filter(Boolean)
                  .join(" · ")}
                meta={product.stock_status}
              >
                {product.image_url ? (
                  <div className="product-media">
                    <img src={getServeUrl(product.image_url)} alt={product.item_name} />
                  </div>
                ) : null}
                <p>Unit: {product.unit}</p>
                <p>Base price: ₹{Number(product.base_price ?? 0).toLocaleString("en-IN")}</p>
                <div className="inline-actions">
                  <button type="button" className="secondary-button" onClick={() => {
                    setEditingId(product.id);
                    setCreateStep(1);
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

      <InventoryIntelligenceDashboard />
    </div>
  );
}

export function InventoryIntelligenceDashboard() {
  const { activeTenant } = useAuth();
  
  const intelligence = useRows(async (client) => {
    // For a real app, this would hit the new NestJS endpoints we created:
    // /api/v1/inventory/alerts/low-stock and /api/v1/inventory/alerts/velocity
    // But since this component is using Supabase client directly in the frontend pattern:
    
    // Low Stock
    const { data: lowStock } = await client
      .from("product_inventory")
      .select("*, products!inner(item_name, sku, tenant_id)")
      .eq("products.tenant_id", activeTenant?.id ?? "")
      .lte("available_qty", 5); // Using 5 as fallback threshold

    // Velocity (Mocked via recent supplied orders for now since we don't have the RPC frontend wrapper here yet)
    const { data: velocity } = await client
      .from("order_items")
      .select("*, products!inner(item_name, sku, tenant_id)")
      .eq("products.tenant_id", activeTenant?.id ?? "")
      .eq("status", "supplied")
      .order("supplied_at", { ascending: false })
      .limit(10);

    return { 
      data: [{ lowStock: lowStock || [], velocity: velocity || [] }], 
      error: null 
    };
  }, [activeTenant?.id], { realtimeTable: "product_inventory" });

  const data = intelligence.data[0] || { lowStock: [], velocity: [] };

  return (
    <PageSection title="Inventory Intelligence" description="Automated insights for stock levels and supply velocity.">
      <QueryState 
        loading={intelligence.loading} 
        error={intelligence.error} 
        hasData={true}
        empty={{ title: "No intelligence data", description: "Insufficient data to provide inventory intelligence." }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CardGrid>
            <DataCard title="Low Stock Alerts" subtitle="Items below reorder thresholds" meta={`${data.lowStock.length} items`}>
              {data.lowStock.length === 0 ? (
                <p>All stock levels are healthy.</p>
              ) : (
                <ul className="list-disc pl-4 mt-2">
                  {data.lowStock.map((item: any) => (
                    <li key={item.product_id} className="text-red-500 font-medium">
                      {item.products?.item_name} ({item.available_qty} left)
                    </li>
                  ))}
                </ul>
              )}
            </DataCard>
          </CardGrid>

          <CardGrid>
            <DataCard title="Recent Velocity" subtitle="Most recently supplied items" meta={`${data.velocity.length} actions`}>
              {data.velocity.length === 0 ? (
                <p>No recent supply activity.</p>
              ) : (
                <ul className="list-disc pl-4 mt-2">
                  {data.velocity.map((item: any) => (
                    <li key={item.id} className="text-zinc-700 dark:text-zinc-300">
                      {item.products?.item_name} ({item.quantity_supplied} supplied)
                    </li>
                  ))}
                </ul>
              )}
            </DataCard>
          </CardGrid>
        </div>
      </QueryState>
    </PageSection>
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
    const ok = await mutation.run(async () => suggestSubstituteItem({
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
          empty={{ title: "No substitution records in database", description: "Substitute suggestion rows will appear here when they are created in the database." }}
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
