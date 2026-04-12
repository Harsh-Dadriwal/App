import { useMemo, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useRows } from "@/components/app-state";
import { Card, Chip, Field, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";

export function CatalogScreen() {
  const { profile } = useAuth();
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [query, setQuery] = useState("");
  const categories = useRows(async (client) => {
    const { data, error } = await client.from("product_categories").select("id, name").order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const brands = useRows(async (client) => {
    const { data, error } = await client.from("product_brands").select("id, category_id, name").order("name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);
  const products = useRows(async (client) => {
    const { data, error } = await client
      .from("products")
      .select("id, item_name, sku, base_price, unit, image_url, category_id, brand_id, stock_status")
      .order("item_name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);

  const filteredBrands = useMemo(
    () => brands.data.filter((brand: any) => !categoryId || brand.category_id === categoryId),
    [brands.data, categoryId]
  );
  const visibleProducts = useMemo(
    () =>
      products.data.filter((product: any) => {
        const categoryMatch = !categoryId || product.category_id === categoryId;
        const brandMatch = !brandId || product.brand_id === brandId;
        const searchMatch =
          !query.trim() ||
          [product.item_name, product.sku]
            .some((value) => String(value ?? "").toLowerCase().includes(query.trim().toLowerCase()));
        return categoryMatch && brandMatch && searchMatch;
      }),
    [products.data, categoryId, brandId, query]
  );

  return (
    <ScreenShell
      title="Product catalog"
      subtitle={`${profile?.role === "admin" ? "Admin" : "Field"} mobile browsing with quick category, brand, and product filters.`}
      currentScreen="catalog"
      showBack
    >
      <Card tone="brand">
        <SectionTitle title="Filter first, tap less" description="Pick category, then brand, then search by item or SKU." />
        <Field label="Search product" value={query} onChangeText={setQuery} placeholder="Switch board, MCB, wire, SKU..." />
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="All" active={!categoryId} onPress={() => { setCategoryId(""); setBrandId(""); }} />
            {categories.data.map((category: any) => (
              <Chip key={category.id} label={category.name} active={categoryId === category.id} onPress={() => { setCategoryId(category.id); setBrandId(""); }} />
            ))}
          </View>
        </ScrollView>
        <Text style={{ fontWeight: "700", marginTop: 14, marginBottom: 8 }}>Brand</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="All" active={!brandId} onPress={() => setBrandId("")} />
            {filteredBrands.map((brand: any) => (
              <Chip key={brand.id} label={brand.name} active={brandId === brand.id} onPress={() => setBrandId(brand.id)} />
            ))}
          </View>
        </ScrollView>
      </Card>

      <SectionTitle title="Products" description="Same live products table as the web app." />
      <QueryState
        loading={products.loading}
        error={products.error}
        hasData={visibleProducts.length > 0}
        empty="No products match the current filters."
      >
        {visibleProducts.map((product: any) => (
          <Card key={product.id}>
            {product.image_url ? (
              <Image source={{ uri: product.image_url }} style={{ width: "100%", height: 180, borderRadius: 18, marginBottom: 12 }} />
            ) : null}
            <Text style={{ fontSize: 18, fontWeight: "700" }}>{product.item_name}</Text>
            <Text style={{ marginTop: 4 }}>{product.sku || "No SKU"}</Text>
            <Text style={{ marginTop: 4 }}>₹{Number(product.base_price ?? 0).toLocaleString("en-IN")} · {product.unit}</Text>
            <Text style={{ marginTop: 4 }}>Status: {product.stock_status}</Text>
          </Card>
        ))}
      </QueryState>
    </ScreenShell>
  );
}
