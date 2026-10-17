import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, Chip, Field, Notice, QueryState, ScreenShell, SkeletonList } from "@/components/ui";
import { useMutationAction, useRows } from "@/components/app-state";
import { palette, radii, shadow } from "@/lib/theme";
import { useAuth } from "@/providers/auth-provider";
import { useMobileNavigation } from "@/providers/navigation-provider";
import { createOrderRequest, createQuotation, getPriceCatalog, listOrderRequests, updateOrderRequestStatus } from "@/lib/backend/shop-gateway";
import { formatPriceListAmount } from "@mahalaxmi/core/gateway/inventory-gateway";
import { countBy } from "@mahalaxmi/core/gateway/price-list-taxonomy";
import {
  ORDER_NEXT_STATUSES,
  ORDER_STATUS_ACTIONS,
  ORDER_STATUS_LABELS,
  filterCatalog,
  indexCatalog,
  type IndexedCatalogItem,
  type OrderRequest,
  type OrderRequestList,
  type OrderRequestStatus
} from "@mahalaxmi/core/gateway/shop-gateway";
import { useCart, useCatalog } from "@mahalaxmi/core/hooks/shop-store";

const PAGE_SIZE = 30;
const TILE_TONES = ["#7c2d12", "#0f766e", "#1e3a8a", "#6d28d9", "#9a3412", "#065f46", "#334155", "#a16207"];
// Category pictures are served through the web app (the storage bucket is private).
const WEB_APP_URL = (process.env.EXPO_PUBLIC_WEB_APP_URL || "https://app-rho-one-49.vercel.app").replace(/\/$/, "");

function imageUri(url: string | undefined) {
  if (!url) return undefined;
  if (!url.includes("cloudflarestorage.com") && !url.includes("amazonaws.com")) return url;
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const key = parts[0] === "product-image-store" || parts[0] === "photo-product-bucket" ? parts.slice(1) : parts;
    return `${WEB_APP_URL}/api/view-image?key=${key.join("/")}`;
  } catch {
    return url;
  }
}

function toneFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return TILE_TONES[Math.abs(hash) % TILE_TONES.length];
}

function initials(name: string) {
  return name
    .split(/[\s&,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

function CategoryArt({ name, url, size }: { name: string; url?: string; size: "tile" | "thumb" }) {
  const style = size === "tile" ? styles.tileArt : styles.thumbArt;
  const uri = imageUri(url);
  return uri ? (
    <Image source={{ uri }} style={style} resizeMode="cover" />
  ) : (
    <View style={[style, styles.artFallback, { backgroundColor: toneFor(name) }]}>
      <Text style={[styles.artText, size === "thumb" && { fontSize: 15 }]}>{initials(name)}</Text>
    </View>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={() => onChange(value - 1)} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel="One less" hitSlop={6}>
        <Feather name={value === 1 ? "trash-2" : "minus"} size={16} color={palette.brand} />
      </Pressable>
      <TextInput
        value={String(value)}
        onChangeText={(text) => onChange(Number(text.replace(/\D/g, "")) || 0)}
        keyboardType="number-pad"
        style={styles.stepperInput}
        accessibilityLabel="Quantity"
      />
      <Pressable onPress={() => onChange(value + 1)} style={styles.stepperButton} accessibilityRole="button" accessibilityLabel="One more" hitSlop={6}>
        <Feather name="plus" size={16} color={palette.brand} />
      </Pressable>
    </View>
  );
}

/** Order from the Tally price list: categories with pictures, availability, no prices. */
export function ShopScreen() {
  const catalog = useCatalog(getPriceCatalog);
  const cart = useCart();
  const { navigate } = useMobileNavigation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [cartOpen, setCartOpen] = useState(false);

  const images = catalog.data?.categoryImages ?? {};
  const items = useMemo(() => indexCatalog(catalog.data?.items ?? []), [catalog.data]);
  const categories = useMemo(() => countBy(items, (item) => item.category), [items]);
  const brands = useMemo(() => countBy(items.filter((item) => !category || item.category === category), (item) => item.brand).slice(0, 20), [items, category]);
  const browsing = Boolean(query.trim() || category);
  const results = useMemo(
    () => (browsing ? filterCatalog(items, { query, category, brand, inStockOnly }) : []),
    [browsing, items, query, category, brand, inStockOnly]
  );
  const visible = results.slice(0, visibleCount);

  function chooseCategory(next: string | null) {
    setCategory(next);
    setBrand(null);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <ScreenShell
      title={category ?? "Shop products"}
      subtitle={category ? `${results.length.toLocaleString("en-IN")} items` : "Live stock from our store. Prices are confirmed at billing."}
      currentScreen="shop"
      footer={
        cart.count > 0 ? (
          <Pressable style={styles.cartBar} onPress={() => setCartOpen(true)} accessibilityRole="button" accessibilityLabel="View cart">
            <Feather name="shopping-cart" size={18} color="#fff" />
            <Text style={styles.cartBarText}>
              {cart.count} {cart.count === 1 ? "item" : "items"} · {cart.totalQuantity.toLocaleString("en-IN")} pcs
            </Text>
            <Text style={styles.cartBarAction}>View cart</Text>
            <Feather name="chevron-right" size={18} color="#fff" />
          </Pressable>
        ) : null
      }
    >
      <Field
        label="Search"
        value={query}
        onChangeText={(text) => {
          setQuery(text);
          setVisibleCount(PAGE_SIZE);
        }}
        placeholder="e.g. 6A switch anchor"
        icon="search"
        autoCapitalize="none"
      />
      {category ? (
        <Pressable onPress={() => chooseCategory(null)} hitSlop={8} accessibilityRole="button" style={styles.backRow}>
          <Feather name="arrow-left" size={16} color={palette.brand} />
          <Text style={styles.link}>All categories</Text>
        </Pressable>
      ) : null}

      {catalog.loading ? (
        <SkeletonList count={4} />
      ) : catalog.error && !catalog.data ? (
        <>
          <Notice message={catalog.error} tone="error" />
          <AppButton label="Try again" kind="secondary" icon="refresh-cw" onPress={() => void catalog.refresh()} />
        </>
      ) : !items.length ? (
        <Notice message="The catalogue is being prepared. Please check back shortly." tone="default" />
      ) : !browsing ? (
        <View style={styles.tiles}>
          {categories.map(([name, count]) => (
            <Pressable key={name} style={({ pressed }) => [styles.tile, pressed && styles.pressed]} onPress={() => chooseCategory(name)} accessibilityRole="button" accessibilityLabel={`${name}, ${count} items`}>
              <CategoryArt name={name} url={images[name]} size="tile" />
              <View style={styles.tileLabel}>
                <Text style={styles.tileName} numberOfLines={2}>{name}</Text>
                <Text style={styles.tileCount}>{count.toLocaleString("en-IN")} items</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="In stock only" active={inStockOnly} onPress={() => setInStockOnly(!inStockOnly)} />
            {brands.length > 1 ? <Chip label="All brands" active={!brand} onPress={() => setBrand(null)} /> : null}
            {brands.length > 1
              ? brands.map(([name, count]) => <Chip key={name} label={`${name} ${count}`} active={brand === name} onPress={() => setBrand(brand === name ? null : name)} />)
              : null}
          </ScrollView>
          {results.length === 0 ? (
            <Notice message="No products match. Try fewer words or check the spelling." tone="default" />
          ) : null}
          {visible.map((item) => (
            <ShopItemRow key={item.key} item={item} imageUrl={images[item.category]} quantity={cart.quantityOf(item.key)} onQuantity={(next) => cart.setQuantity(item, next)} />
          ))}
          {results.length > visible.length ? (
            <AppButton
              label={`Show more (${(results.length - visible.length).toLocaleString("en-IN")} left)`}
              kind="secondary"
              icon="chevron-down"
              onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
            />
          ) : null}
        </>
      )}

      <CartSheet
        visible={cartOpen}
        onClose={() => setCartOpen(false)}
        onPlaced={(kind) => {
          setCartOpen(false);
          navigate(kind === "order" ? "orders" : "quotations");
        }}
      />
    </ScreenShell>
  );
}

function ShopItemRow({
  item,
  imageUrl,
  quantity,
  onQuantity
}: {
  item: IndexedCatalogItem;
  imageUrl?: string;
  quantity: number;
  onQuantity: (next: number) => void;
}) {
  return (
    <View style={[styles.item, !item.inStock && styles.itemOut]}>
      <CategoryArt name={item.category} url={imageUrl} size="thumb" />
      <View style={styles.itemBody}>
        <Text style={styles.itemMeta} numberOfLines={1}>
          {item.brand ? <Text style={styles.itemBrand}>{item.brand.toUpperCase()} · </Text> : null}
          {item.category.toUpperCase()}
        </Text>
        <Text style={styles.itemName} numberOfLines={3}>{item.name}</Text>
        <View style={styles.itemBottom}>
          <Text style={[styles.stockPill, item.inStock ? styles.stockIn : styles.stockOut]}>{item.inStock ? "In stock" : "Out of stock"}</Text>
          {!item.inStock ? null : quantity > 0 ? (
            <Stepper value={quantity} onChange={onQuantity} />
          ) : (
            <Pressable style={styles.addButton} onPress={() => onQuantity(1)} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`}>
              <Feather name="plus" size={15} color="#fff" />
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function CartSheet({ visible, onClose, onPlaced }: { visible: boolean; onClose: () => void; onPlaced: (kind: "order" | "quotation") => void }) {
  const { profile } = useAuth();
  const cart = useCart();
  const submit = useMutationAction();
  const [address, setAddress] = useState(profile?.city ?? "");
  const [phone, setPhone] = useState(profile?.phone?.replace(/^\+91/, "") ?? "");
  const [note, setNote] = useState("");

  async function send() {
    let orderNumber = "";
    const ok = await submit.run(async () => {
      const result = await createOrderRequest({
        items: cart.lines.map((line) => ({ key: line.key, quantity: line.quantity })),
        delivery_address: address,
        contact_phone: phone || undefined,
        note: note || undefined
      });
      orderNumber = result.data?.order_number ?? "";
      return { error: result.error };
    });
    if (ok) {
      cart.clear();
      setNote("");
      Alert.alert("Order sent", `${orderNumber ? `Order ${orderNumber} received. ` : ""}We will confirm it shortly and notify you at each step.`);
      onPlaced("order");
    }
  }

  // Same cart, but the shop sends prices first instead of taking the order straight away.
  async function askForQuotation() {
    let quotationNumber = "";
    const ok = await submit.run(async () => {
      const result = await createQuotation({
        items: cart.lines.map((line) => ({ key: line.key, quantity: line.quantity })),
        photo_keys: [],
        note: note || undefined,
        contact_phone: phone || undefined
      });
      quotationNumber = result.data?.quotation_number ?? "";
      return { error: result.error };
    });
    if (ok) {
      cart.clear();
      setNote("");
      Alert.alert("Quotation requested", `${quotationNumber ? `${quotationNumber} received. ` : ""}The shop will send you prices for these items.`);
      onPlaced("quotation");
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Your cart</Text>
          <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close cart" hitSlop={8}>
            <Feather name="x" size={20} color={palette.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {cart.lines.length === 0 ? <Notice message="Your cart is empty." tone="default" /> : null}
          {cart.lines.map((line) => (
            <View key={line.key} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lineName}>{line.name}</Text>
                <Text style={styles.lineMeta}>{[line.brand, line.category].filter(Boolean).join(" · ")}</Text>
              </View>
              <Stepper value={line.quantity} onChange={(next) => cart.setQuantity(line, next)} />
            </View>
          ))}
          {cart.lines.length ? (
            <>
              <Field label="Delivery address" value={address} onChangeText={setAddress} placeholder="House / shop, street, area, city" multiline icon="map-pin" />
              <Field label="Contact number" value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" keyboardType="phone-pad" icon="phone" />
              <Field label="Note for the shop (optional)" value={note} onChangeText={setNote} placeholder="Delivery time, site name, colour…" multiline />
              <Text style={styles.muted}>Prices are confirmed by the shop at billing.</Text>
              {submit.error ? <Notice message={submit.error} tone="error" /> : null}
              <AppButton
                label={submit.loading ? "Sending..." : `Send order (${cart.count} ${cart.count === 1 ? "item" : "items"})`}
                icon="send"
                loading={submit.loading}
                disabled={address.trim().length < 5}
                onPress={() => void send()}
              />
              <AppButton label="Ask for a quotation instead" icon="file-text" kind="secondary" disabled={submit.loading} onPress={() => void askForQuotation()} />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const STATUS_STEPS: OrderRequestStatus[] = ["submitted", "confirmed", "ready", "delivered"];

function statusColors(status: OrderRequestStatus) {
  if (status === "cancelled") return { color: palette.danger, backgroundColor: palette.dangerSoft };
  if (status === "delivered") return { color: palette.success, backgroundColor: palette.successSoft };
  if (status === "submitted") return { color: palette.brandDeep, backgroundColor: palette.brandSoft };
  return { color: palette.teal, backgroundColor: palette.tealSoft };
}

function OrderCard({ order, canManage, onDone }: { order: OrderRequest; canManage: boolean; onDone: () => void }) {
  const action = useMutationAction();
  const [note, setNote] = useState("");
  const reached = STATUS_STEPS.indexOf(order.status);
  const phone = order.contact_phone || order.customer?.phone;

  async function change(next: OrderRequestStatus) {
    const run = async () => {
      const ok = await action.run(() => updateOrderRequestStatus(order.id, next, note.trim() || undefined));
      if (ok) {
        setNote("");
        onDone();
      }
    };
    if (next === "cancelled") {
      Alert.alert(`Cancel ${order.order_number}?`, undefined, [
        { text: "Keep order", style: "cancel" },
        { text: "Cancel order", style: "destructive", onPress: () => void run() }
      ]);
    } else {
      await run();
    }
  }

  return (
    <View style={styles.order}>
      <View style={styles.orderHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderNumber}>{order.order_number}</Text>
          <Text style={styles.muted}>{new Date(order.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</Text>
        </View>
        <Text style={[styles.stockPill, statusColors(order.status)]}>{ORDER_STATUS_LABELS[order.status]}</Text>
      </View>
      {order.status !== "cancelled" ? (
        <View style={styles.steps}>
          {STATUS_STEPS.map((step, index) => (
            <View key={step} style={[styles.step, index <= reached && styles.stepDone]} />
          ))}
        </View>
      ) : null}
      {canManage ? (
        <View style={{ gap: 2 }}>
          <Text style={styles.lineName}>{order.customer?.full_name ?? "Customer"}{order.customer?.role && order.customer.role !== "customer" ? ` · ${order.customer.role}` : ""}</Text>
          {phone ? <Text style={styles.link}>{phone}</Text> : null}
          <Text style={styles.muted}>{order.delivery_address}</Text>
          {order.note ? <Text style={styles.muted}>Note: {order.note}</Text> : null}
        </View>
      ) : null}
      {order.items.map((item, index) => (
        <View key={`${item.key}-${index}`} style={styles.orderItem}>
          <Text style={styles.orderItemName}>{item.name}</Text>
          <Text style={styles.orderQty}>
            × {item.quantity.toLocaleString("en-IN")}
            {canManage && item.unit_price ? ` @ ${formatPriceListAmount(item.unit_price)}` : ""}
          </Text>
        </View>
      ))}
      {canManage ? <Text style={styles.muted}>Estimate {formatPriceListAmount(order.estimated_total ?? 0)} at today&apos;s prices</Text> : null}
      {order.admin_note ? <Text style={styles.muted}>{canManage ? "Your note" : "Shop"}: {order.admin_note}</Text> : null}
      {action.error ? <Notice message={action.error} tone="error" /> : null}
      {canManage && ORDER_NEXT_STATUSES[order.status].length ? (
        <>
          <TextInput value={note} onChangeText={setNote} placeholder="Note for the customer (optional)" placeholderTextColor={palette.muted} style={styles.noteInput} />
          <View style={styles.actions}>
            {ORDER_NEXT_STATUSES[order.status].map((next) => (
              <Pressable
                key={next}
                style={[styles.actionButton, next === "cancelled" && styles.actionButtonQuiet]}
                disabled={action.loading}
                onPress={() => void change(next)}
                accessibilityRole="button"
              >
                <Text style={[styles.actionText, next === "cancelled" && styles.actionTextQuiet]}>{ORDER_STATUS_ACTIONS[next]}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {!canManage && order.status === "submitted" ? (
        <Pressable onPress={() => void change("cancelled")} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.link, { color: palette.danger }]}>Cancel order</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const ADMIN_FILTERS: Array<{ id: string; label: string; statuses: OrderRequestStatus[] }> = [
  { id: "new", label: "New", statuses: ["submitted"] },
  { id: "active", label: "In progress", statuses: ["confirmed", "ready"] },
  { id: "done", label: "Delivered", statuses: ["delivered"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled"] }
];

/** Customers see their own orders (no prices); admins see every order and move it along. */
export function OrdersScreen() {
  const { navigate } = useMobileNavigation();
  const [filter, setFilter] = useState("new");
  const orders = useRows<OrderRequestList>(async () => {
    const result = await listOrderRequests();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);
  const canManage = orders.data[0]?.canManage ?? false;
  const all = orders.data[0]?.orders ?? [];
  const statuses = ADMIN_FILTERS.find((option) => option.id === filter)?.statuses ?? [];
  const list = canManage ? all.filter((order) => statuses.includes(order.status)) : all;

  return (
    <ScreenShell title={canManage ? "Orders" : "My orders"} subtitle={canManage ? "Orders sent from the price list" : "Track what you ordered"} currentScreen="orders">
      {canManage ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {ADMIN_FILTERS.map((option) => {
            const count = all.filter((order) => option.statuses.includes(order.status)).length;
            return <Chip key={option.id} label={`${option.label}${count ? ` ${count}` : ""}`} active={filter === option.id} onPress={() => setFilter(option.id)} />;
          })}
        </ScrollView>
      ) : (
        <AppButton label="Shop products" icon="shopping-bag" kind="secondary" onPress={() => navigate("shop")} />
      )}
      <QueryState
        loading={orders.loading}
        error={orders.error}
        hasData={list.length > 0}
        empty={canManage ? "No orders with this status." : "No orders yet. Add products to your cart from the shop and send your order."}
      >
        {list.map((order) => (
          <OrderCard key={order.id} order={order} canManage={canManage} onDone={() => orders.refetch?.()} />
        ))}
      </QueryState>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: 8, paddingRight: 8 },
  link: { color: palette.brand, fontWeight: "800" },
  muted: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    width: "47.8%",
    overflow: "hidden",
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    ...shadow
  },
  tileArt: { width: "100%", aspectRatio: 4 / 3 },
  thumbArt: { width: 58, height: 58, borderRadius: radii.sm },
  artFallback: { alignItems: "center", justifyContent: "center" },
  artText: { color: "rgba(255,255,255,0.92)", fontSize: 26, fontWeight: "900", letterSpacing: 1 },
  tileLabel: { padding: 12, gap: 2 },
  tileName: { fontSize: 14.5, fontWeight: "800", color: palette.ink },
  tileCount: { fontSize: 12, color: palette.muted },
  item: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    ...shadow
  },
  itemOut: { opacity: 0.6 },
  itemBody: { flex: 1, gap: 4 },
  itemMeta: { fontSize: 10.5, fontWeight: "700", letterSpacing: 0.3, color: palette.muted },
  itemBrand: { color: palette.brand },
  itemName: { fontSize: 15, fontWeight: "800", color: palette.ink, lineHeight: 20 },
  itemBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 },
  stockPill: { overflow: "hidden", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: "800" },
  stockIn: { color: palette.success, backgroundColor: palette.successSoft },
  stockOut: { color: palette.danger, backgroundColor: palette.dangerSoft },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: palette.brand },
  addText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: palette.brand, borderRadius: 999, overflow: "hidden" },
  stepperButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: palette.brandSoft },
  stepperInput: { minWidth: 42, height: 36, paddingVertical: 0, textAlign: "center", fontWeight: "800", fontSize: 15, color: palette.ink },
  cartBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: palette.brand,
    ...shadow,
    elevation: 8
  },
  cartBarText: { flex: 1, color: "#fff", fontWeight: "800", fontSize: 15 },
  cartBarAction: { color: "#fff", fontWeight: "700" },
  sheet: { flex: 1, backgroundColor: palette.bg },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  sheetTitle: { fontSize: 22, fontWeight: "900", color: palette.ink },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.lineStrong },
  lineName: { fontSize: 14.5, fontWeight: "800", color: palette.ink },
  lineMeta: { fontSize: 12, color: palette.muted },
  order: {
    gap: 10,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    ...shadow
  },
  orderHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  orderNumber: { fontSize: 16, fontWeight: "900", color: palette.ink },
  steps: { flexDirection: "row", gap: 4 },
  step: { flex: 1, height: 4, borderRadius: 4, backgroundColor: palette.line },
  stepDone: { backgroundColor: palette.teal },
  orderItem: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  orderItemName: { flex: 1, color: palette.ink, fontSize: 14 },
  orderQty: { fontWeight: "800", color: palette.ink, fontSize: 14 },
  noteInput: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceSoft,
    color: palette.ink
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionButton: { minHeight: 42, paddingHorizontal: 16, justifyContent: "center", borderRadius: 999, backgroundColor: palette.brand },
  actionButtonQuiet: { backgroundColor: palette.dangerSoft },
  actionText: { color: "#fff", fontWeight: "800" },
  actionTextQuiet: { color: palette.danger }
});
