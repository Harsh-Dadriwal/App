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
import { ADMIN_ASSIGN_STEPS, ModalShell, slugify } from "./shared";
export function AdminCatalogPage() {
  const { activeTenant } = useAuth();
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

  const categories = useRows(
    async (client) => {
      let query = client
        .from("product_categories")
        .select("id, name, slug, sort_order");
      if (activeTenant?.id) {
        query = query.eq("tenant_id", activeTenant.id);
      }
      const { data, error } = await query.order("sort_order").order("name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [activeTenant?.id]
  );
  const brands = useRows(
    async (client) => {
      let query = client
        .from("product_brands")
        .select("id, category_id, name, slug, sort_order");
      if (activeTenant?.id) {
        query = query.eq("tenant_id", activeTenant.id);
      }
      const { data, error } = await query.order("sort_order").order("name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [activeTenant?.id]
  );
  const products = useRows(
    async (client) => {
      let query = client.from("products").select("id, category_id, brand_id");
      if (activeTenant?.id) {
        query = query.eq("tenant_id", activeTenant.id);
      }
      const { data, error } = await query;
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [activeTenant?.id]
  );
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
  const consolidatedBrands = useMemo(() => {
    const groups = new Map<string, {
      name: string;
      slug: string;
      sort_order: number;
      rows: any[];
    }>();

    brands.data.forEach((brand: any) => {
      if (!brand.name) return;
      const key = brand.name.trim().toLowerCase();
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(brand);
      } else {
        groups.set(key, {
          name: brand.name,
          slug: brand.slug,
          sort_order: brand.sort_order ?? 0,
          rows: [brand]
        });
      }
    });

    return Array.from(groups.values());
  }, [brands.data]);

  const filteredConsolidatedBrands = useMemo(() => {
    const query = brandSearch.trim().toLowerCase();
    if (!query) return consolidatedBrands;
    return consolidatedBrands.filter((brand: any) => {
      const matchName = brand.name.toLowerCase().includes(query);
      const matchSlug = brand.slug.toLowerCase().includes(query);
      const matchCategory = brand.rows.some((row: any) => {
        const catName = categoryLookup.get(row.category_id);
        return String(catName ?? "").toLowerCase().includes(query);
      });
      return matchName || matchSlug || matchCategory;
    });
  }, [consolidatedBrands, brandSearch, categoryLookup]);


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
      sort_order: Number(categoryForm.sort_order || 0),
      tenant_id: activeTenant?.id
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
      sort_order: Number(brandForm.sort_order || 0),
      tenant_id: activeTenant?.id
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
          hasData={filteredConsolidatedBrands.length > 0}
          empty={{ title: "No brands yet", description: "Create brands here after your categories are ready." }}
        >
          <CardGrid>
            {filteredConsolidatedBrands.map((brand: any) => {
              const totalProducts = brand.rows.reduce((sum: number, r: any) => sum + (productCountsByBrand.get(r.id) ?? 0), 0);

              return (
                <DataCard key={brand.slug} title={brand.name} subtitle={brand.slug} meta={`Sort ${brand.sort_order ?? 0}`}>
                  <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, color: "var(--text-primary, #1e293b)" }}>Linked Categories:</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                    {brand.rows.map((row: any) => {
                      const catName = categoryLookup.get(row.category_id) ?? "Unlinked category";
                      return (
                        <div
                          key={row.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            backgroundColor: "rgba(148, 163, 184, 0.08)",
                            border: "1px solid rgba(148, 163, 184, 0.2)",
                            borderRadius: 100,
                            padding: "4px 10px",
                            fontSize: 12
                          }}
                        >
                          <span style={{ color: "var(--text-secondary, #475569)" }}>{catName}</span>
                          <button
                            type="button"
                            style={{ border: "none", background: "none", color: "#d97706", cursor: "pointer", fontSize: 11, padding: "2px 4px", display: "inline-flex", alignItems: "center" }}
                            onClick={() => {
                              setEditingBrandId(row.id);
                              setBrandSlugTouched(false);
                              setBrandForm({
                                category_id: row.category_id ?? "",
                                name: row.name ?? "",
                                slug: row.slug ?? "",
                                sort_order: String(row.sort_order ?? 0)
                              });
                              brandMutation.reset();
                              setIsBrandModalOpen(true);
                            }}
                            title={`Edit linkage for ${catName}`}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", fontSize: 11, padding: "2px 4px", display: "inline-flex", alignItems: "center" }}
                            onClick={() => void deleteBrand(row.id)}
                            disabled={brandMutation.isSubmitting}
                            title={`Delete linkage for ${catName}`}
                          >
                            ❌
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-muted, #64748b)" }}>Total products linked: {totalProducts}</p>
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ width: "100%", fontSize: 12, padding: "6px 8px" }}
                      onClick={() => {
                        setEditingBrandId(null);
                        setBrandSlugTouched(false);
                        setBrandForm({
                          category_id: "",
                          name: brand.name,
                          slug: brand.slug,
                          sort_order: String(brand.sort_order)
                        });
                        brandMutation.reset();
                        setIsBrandModalOpen(true);
                      }}
                    >
                      + Link to another category
                    </button>
                  </div>
                </DataCard>
              );
            })}
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
