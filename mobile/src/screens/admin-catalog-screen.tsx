import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useMutationAction, useRows } from "@/components/app-state";
import { AppButton, Card, Chip, Field, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AdminCatalogScreen() {
  const { profile } = useAuth();
  const categoryMutation = useMutationAction();
  const brandMutation = useMutationAction();
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandSlug, setBrandSlug] = useState("");
  const [brandCategoryId, setBrandCategoryId] = useState("");

  const categories = useRows(async (client) => {
    const { data, error } = await client.from("product_categories").select("id, name, slug").order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const brands = useRows(async (client) => {
    const { data, error } = await client.from("product_brands").select("id, name, slug, category_id").order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const products = useRows(async (client) => {
    const { data, error } = await client.from("products").select("id, brand_id, category_id");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);

  const categoryProductCount = useMemo(() => {
    const counts = new Map<string, number>();
    products.data.forEach((product: any) => counts.set(product.category_id, (counts.get(product.category_id) ?? 0) + 1));
    return counts;
  }, [products.data]);

  const brandProductCount = useMemo(() => {
    const counts = new Map<string, number>();
    products.data.forEach((product: any) => counts.set(product.brand_id, (counts.get(product.brand_id) ?? 0) + 1));
    return counts;
  }, [products.data]);

  async function createCategory() {
    if (!supabase) return;
    const client = supabase;
    const ok = await categoryMutation.run(
      async () => client.from("product_categories").insert({ name: categoryName, slug: categorySlug || slugify(categoryName) }),
      "Category created."
    );
    if (ok) {
      setCategoryName("");
      setCategorySlug("");
      categories.refetch();
    }
  }

  async function createBrand() {
    if (!supabase) return;
    const client = supabase;
    const ok = await brandMutation.run(
      async () => client.from("product_brands").insert({ category_id: brandCategoryId, name: brandName, slug: brandSlug || slugify(brandName) }),
      "Brand created."
    );
    if (ok) {
      setBrandName("");
      setBrandSlug("");
      setBrandCategoryId("");
      brands.refetch();
    }
  }

  if (profile?.role !== "admin") {
    return (
      <ScreenShell title="Admin only" subtitle="This screen is only available to admin accounts." />
    );
  }

  return (
    <ScreenShell
      title="Admin catalog controls"
      subtitle="Quick category and brand management from mobile, with safe linked-product visibility."
      currentScreen="admin-catalog"
      showBack
    >
      <Card tone="brand">
        <SectionTitle title="Create category" />
        <Field label="Category name" value={categoryName} onChangeText={(value) => { setCategoryName(value); setCategorySlug(slugify(value)); }} />
        <Field label="Slug" value={categorySlug} onChangeText={(value) => setCategorySlug(slugify(value))} />
        <AppButton label={categoryMutation.loading ? "Saving..." : "Create category"} icon="plus" onPress={() => void createCategory()} disabled={categoryMutation.loading} />
      </Card>

      <Card tone="soft">
        <SectionTitle title="Create brand" />
        <Text style={{ fontWeight: "800", marginBottom: 6 }}>Pick category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {categories.data.map((category: any) => (
              <Chip
                key={category.id}
                label={category.name}
                active={brandCategoryId === category.id}
                onPress={() => setBrandCategoryId(category.id)}
              />
            ))}
          </View>
        </ScrollView>
        {!categories.data.length ? (
          <Field label="Category id" value={brandCategoryId} onChangeText={setBrandCategoryId} placeholder="Paste category id" />
        ) : null}
        <Field label="Brand name" value={brandName} onChangeText={(value) => { setBrandName(value); setBrandSlug(slugify(value)); }} />
        <Field label="Slug" value={brandSlug} onChangeText={(value) => setBrandSlug(slugify(value))} />
        <AppButton label={brandMutation.loading ? "Saving..." : "Create brand"} icon="plus" onPress={() => void createBrand()} disabled={brandMutation.loading} />
      </Card>

      {categoryMutation.success ? <Notice message={categoryMutation.success} tone="success" /> : null}
      {categoryMutation.error ? <Notice message={categoryMutation.error} tone="error" /> : null}
      {brandMutation.success ? <Notice message={brandMutation.success} tone="success" /> : null}
      {brandMutation.error ? <Notice message={brandMutation.error} tone="error" /> : null}

      <SectionTitle title="Categories" />
      <QueryState loading={categories.loading} error={categories.error} hasData={categories.data.length > 0} empty="No categories yet.">
        {categories.data.map((category: any) => (
          <Card key={category.id}>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>{category.name}</Text>
            <Text style={{ marginTop: 4 }}>{category.slug}</Text>
            <Text style={{ marginTop: 4 }}>Products linked: {categoryProductCount.get(category.id) ?? 0}</Text>
          </Card>
        ))}
      </QueryState>

      <SectionTitle title="Brands" />
      <QueryState loading={brands.loading} error={brands.error} hasData={brands.data.length > 0} empty="No brands yet.">
        {brands.data.map((brand: any) => (
          <Card key={brand.id} tone="soft">
            <Text style={{ fontSize: 18, fontWeight: "700" }}>{brand.name}</Text>
            <Text style={{ marginTop: 4 }}>{brand.slug}</Text>
            <Text style={{ marginTop: 4 }}>Products linked: {brandProductCount.get(brand.id) ?? 0}</Text>
          </Card>
        ))}
      </QueryState>
    </ScreenShell>
  );
}
