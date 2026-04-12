import { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useMutationAction, useRows } from "@/components/app-state";
import { AppButton, Card, Chip, Field, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";

export function OrderBuilderScreen() {
  const { profile } = useAuth();
  const mutation = useMutationAction();
  const [siteId, setSiteId] = useState("");
  const [siteOrderId, setSiteOrderId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [quantityRequired, setQuantityRequired] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [approvalMode, setApprovalMode] = useState("architect_then_customer");
  const [notes, setNotes] = useState("");

  const sites = useRows(async (client) => {
    if (!profile?.id) return { data: [] as any[], error: null };
    if (profile.role === "customer") {
      const { data, error } = await client.from("sites").select("id, site_name, site_code").eq("customer_id", profile.id).order("site_name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    }
    if (profile.role === "electrician") {
      const { data, error } = await client.from("vw_electrician_ongoing_projects").select("site_id, site_name, site_code").eq("electrician_id", profile.id);
      return { data: (data ?? []).map((item: any) => ({ id: item.site_id, site_name: item.site_name, site_code: item.site_code })) as any[], error: error?.message ?? null };
    }
    if (profile.role === "architect") {
      const { data, error } = await client.from("vw_architect_ongoing_projects").select("site_id, site_name, site_code").eq("architect_id", profile.id);
      return { data: (data ?? []).map((item: any) => ({ id: item.site_id, site_name: item.site_name, site_code: item.site_code })) as any[], error: error?.message ?? null };
    }
    const { data, error } = await client.from("sites").select("id, site_name, site_code").order("site_name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [profile?.id, profile?.role]);

  const siteOrders = useRows(async (client) => {
    const { data, error } = await client.from("site_orders").select("id, order_number, site_id").order("created_at", { ascending: false });
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
  const products = useRows(async (client) => {
    const { data, error } = await client
      .from("products")
      .select("id, item_name, sku, unit, base_price, category_id, brand_id")
      .order("item_name");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, []);

  const filteredOrders = useMemo(
    () => siteOrders.data.filter((order: any) => !siteId || order.site_id === siteId),
    [siteOrders.data, siteId]
  );
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
          !productSearch.trim() ||
          [product.item_name, product.sku]
            .some((value) => String(value ?? "").toLowerCase().includes(productSearch.trim().toLowerCase()));
        return categoryMatch && brandMatch && searchMatch;
      }),
    [products.data, categoryId, brandId, productSearch]
  );
  const selectedProduct = visibleProducts.find((product: any) => product.id === productId) ?? products.data.find((product: any) => product.id === productId);
  const categoryLookup = new Map(categories.data.map((category: any) => [category.id, category.name]));
  const brandLookup = new Map(brands.data.map((brand: any) => [brand.id, brand.name]));

  async function saveOrderItem() {
    if (!supabase || !profile?.id || !siteId || !siteOrderId || !selectedProduct) {
      return;
    }
    const client = supabase;

    const payload = {
      site_id: siteId,
      site_order_id: siteOrderId,
      product_id: selectedProduct.id,
      source: profile.role === "admin" ? "admin" : profile.role,
      source_user_id: profile.id,
      approval_mode: approvalMode,
      requires_architect_approval: approvalMode === "architect_then_customer",
      item_name_snapshot: selectedProduct.item_name,
      category_name_snapshot: categoryLookup.get(selectedProduct.category_id) ?? null,
      brand_name_snapshot: brandLookup.get(selectedProduct.brand_id) ?? null,
      unit_snapshot: selectedProduct.unit,
      quantity_required: Number(quantityRequired || 0),
      unit_price: Number(unitPrice || selectedProduct.base_price || 0),
      line_subtotal: Number(quantityRequired || 0) * Number(unitPrice || selectedProduct.base_price || 0),
      line_total: Number(quantityRequired || 0) * Number(unitPrice || selectedProduct.base_price || 0),
      electrician_notes: profile.role === "electrician" ? notes || null : null,
      architect_notes: profile.role === "architect" ? notes || null : null,
      customer_notes: profile.role === "customer" ? notes || null : null,
      admin_notes: profile.role === "admin" ? notes || null : null,
      status: approvalMode === "architect_then_customer" ? "pending_architect_approval" : "pending_customer_approval"
    };

    const ok = await mutation.run(
      async () => client.from("order_items").insert(payload),
      "Order item created from mobile."
    );

    if (ok) {
      setCategoryId("");
      setBrandId("");
      setProductSearch("");
      setProductId("");
      setQuantityRequired("1");
      setUnitPrice("");
      setNotes("");
    }
  }

  return (
    <ScreenShell
      title="Easy mobile order builder"
      subtitle="This is the mobile-first material workflow: pick site, pick category, narrow by brand, search the product, then set quantity and send."
      currentScreen="order-builder"
      showBack
    >
      <QueryState loading={sites.loading} error={sites.error} hasData={sites.data.length > 0} empty="No accessible sites are available for this account yet.">
        <Card>
          <SectionTitle title="1. Pick the site" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {sites.data.map((site: any) => (
                <Chip key={site.id} label={site.site_name} active={siteId === site.id} onPress={() => { setSiteId(site.id); setSiteOrderId(""); }} />
              ))}
            </View>
          </ScrollView>
        </Card>
      </QueryState>

      <Card tone="soft">
        <SectionTitle title="2. Pick the order" description="Only orders for the selected site are shown." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {filteredOrders.map((order: any) => (
              <Chip key={order.id} label={order.order_number} active={siteOrderId === order.id} onPress={() => setSiteOrderId(order.id)} />
            ))}
          </View>
        </ScrollView>
      </Card>

      <Card tone="brand">
        <SectionTitle title="3. Narrow the product" />
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {categories.data.map((category: any) => (
              <Chip key={category.id} label={category.name} active={categoryId === category.id} onPress={() => { setCategoryId(category.id); setBrandId(""); setProductId(""); }} />
            ))}
          </View>
        </ScrollView>

        <Text style={{ fontWeight: "700", marginTop: 14, marginBottom: 8 }}>Brand</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {filteredBrands.map((brand: any) => (
              <Chip key={brand.id} label={brand.name} active={brandId === brand.id} onPress={() => { setBrandId(brand.id); setProductId(""); }} />
            ))}
          </View>
        </ScrollView>

        <View style={{ marginTop: 14 }}>
          <Field label="Search product" value={productSearch} onChangeText={setProductSearch} placeholder="Type item name or SKU" />
        </View>
      </Card>

      <SectionTitle title="4. Tap the product" description="The list stays compact and searchable, which is much easier on mobile than long dropdowns." />
      <QueryState loading={products.loading} error={products.error} hasData={visibleProducts.length > 0} empty="No matching products for the current filters.">
        {visibleProducts.slice(0, 30).map((product: any) => (
          <Card key={product.id}>
            <Text style={{ fontSize: 18, fontWeight: "700" }}>{product.item_name}</Text>
            <Text style={{ marginTop: 4 }}>{product.sku || "No SKU"} · {product.unit}</Text>
            <Text style={{ marginTop: 4 }}>₹{Number(product.base_price ?? 0).toLocaleString("en-IN")}</Text>
            <View style={{ marginTop: 12 }}>
              <AppButton label={productId === product.id ? "Selected" : "Choose product"} onPress={() => {
                setProductId(product.id);
                setUnitPrice(String(product.base_price ?? ""));
              }} kind={productId === product.id ? "secondary" : "primary"} icon={productId === product.id ? "check" : "plus"} />
            </View>
          </Card>
        ))}
      </QueryState>

      <Card>
        <SectionTitle title="5. Quantity and notes" />
        <Field label="Quantity required" value={quantityRequired} onChangeText={setQuantityRequired} />
        <Field label="Unit price" value={unitPrice} onChangeText={setUnitPrice} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: "700", marginBottom: 8 }}>Approval mode</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Chip label="Architect then customer" active={approvalMode === "architect_then_customer"} onPress={() => setApprovalMode("architect_then_customer")} />
            <Chip label="Customer only" active={approvalMode === "customer_only"} onPress={() => setApprovalMode("customer_only")} />
          </View>
        </View>
        <View style={{ marginTop: 16 }}>
          <AppButton label={mutation.loading ? "Saving..." : "Create order item"} icon="shopping-cart" onPress={() => void saveOrderItem()} disabled={mutation.loading || !selectedProduct || !siteId || !siteOrderId} />
        </View>
      </Card>

      {mutation.success ? <Notice message={mutation.success} tone="success" /> : null}
      {mutation.error ? <Notice message={mutation.error} tone="error" /> : null}
    </ScreenShell>
  );
}
