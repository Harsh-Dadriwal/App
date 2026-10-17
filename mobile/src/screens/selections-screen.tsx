import { useMemo, useState } from "react";
import { Alert, Linking, Pressable, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { AppButton, Chip, Field, Notice, QueryState, ScreenShell } from "@/components/ui";
import { useMutationAction, useRows } from "@/components/app-state";
import { palette, radii, shadow } from "@/lib/theme";
import { useAuth } from "@/providers/auth-provider";
import { useMobileNavigation } from "@/providers/navigation-provider";
import { closeSelection, getPriceCatalog, listSelections, orderSelection, quoteSelection, saveSelection } from "@/lib/backend/shop-gateway";
import { formatPriceListAmount } from "@mahalaxmi/core/gateway/inventory-gateway";
import {
  ORDER_STATUS_LABELS,
  QUOTATION_STATUS_LABELS,
  SELECTION_STATUS_LABELS,
  filterCatalog,
  indexCatalog,
  selectionShareText,
  type ProductSelection,
  type SelectionList
} from "@mahalaxmi/core/gateway/shop-gateway";
import { useCatalog } from "@mahalaxmi/core/hooks/shop-store";

type PickedItem = { key: string; name: string; quantity: number };

/** Opens WhatsApp with the product list (straight to the customer when we know the number). */
async function shareOnWhatsApp(selection: ProductSelection, from: string) {
  const text = selectionShareText(selection, from);
  const digits = (selection.customer_phone ?? "").replace(/\D/g, "");
  const url = `whatsapp://send?${digits ? `phone=${digits}&` : ""}text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
  } catch {
    // WhatsApp is not installed: offer the phone's share sheet instead.
    await Share.share({ message: text });
  }
}

function Items({ selection, showPrices }: { selection: ProductSelection; showPrices: boolean }) {
  return (
    <>
      {selection.items.map((item, index) => (
        <View key={`${item.key}-${index}`} style={styles.line}>
          <Text style={styles.lineName}>
            {item.name}
            {item.note ? <Text style={styles.muted}> · {item.note}</Text> : null}
            {showPrices && item.in_stock === false ? <Text style={{ color: palette.danger }}> · out of stock</Text> : null}
          </Text>
          <Text style={styles.lineQty}>
            × {item.quantity.toLocaleString("en-IN")}
            {showPrices && item.unit_price ? ` @ ${formatPriceListAmount(item.unit_price)}` : ""}
          </Text>
        </View>
      ))}
    </>
  );
}

function Activity({ selection }: { selection: ProductSelection }) {
  const parts = [
    ...selection.orders.map((order) => `Order ${order.number}: ${ORDER_STATUS_LABELS[order.status]}`),
    ...selection.quotations.map((quote) => `Quotation ${quote.number}: ${QUOTATION_STATUS_LABELS[quote.status]}`)
  ];
  return parts.length ? <Text style={styles.muted}>{parts.join(" · ")}</Text> : null;
}

/** Order these products, or ask the shop for prices first. */
function OrderOrQuote({ selection, onDone }: { selection: ProductSelection; onDone: () => void }) {
  const { navigate } = useMobileNavigation();
  const action = useMutationAction();
  const [address, setAddress] = useState("");

  async function run(kind: "order" | "quotation") {
    const ok = await action.run(() => (kind === "order" ? orderSelection(selection.id, { delivery_address: address.trim() }) : quoteSelection(selection.id)));
    if (ok) {
      onDone();
      Alert.alert(kind === "order" ? "Order placed" : "Quotation requested", kind === "order" ? "The shop will confirm it shortly." : "The shop will send you prices.", [
        { text: "OK" },
        { text: kind === "order" ? "Track order" : "See quotation", onPress: () => navigate(kind === "order" ? "orders" : "quotations") }
      ]);
    }
  }

  if (selection.status === "closed") return null;
  return (
    <>
      <TextInput value={address} onChangeText={setAddress} placeholder="Delivery address" placeholderTextColor={palette.muted} style={styles.input} multiline />
      {action.error ? <Notice message={action.error} tone="error" /> : null}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <AppButton label="Order these" icon="shopping-bag" loading={action.loading} disabled={address.trim().length < 5} onPress={() => void run("order")} />
        </View>
        <View style={{ flex: 1 }}>
          <AppButton label="Get quote" icon="file-text" kind="secondary" disabled={action.loading} onPress={() => void run("quotation")} />
        </View>
      </View>
    </>
  );
}

function SelectionForm({ onSaved }: { onSaved: () => void }) {
  const catalog = useCatalog(getPriceCatalog);
  const save = useMutationAction();
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [siteNote, setSiteNote] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const items = useMemo(() => indexCatalog(catalog.data?.items ?? []), [catalog.data]);
  const matches = useMemo(() => (query.trim() ? filterCatalog(items, { query, category: null, brand: null, inStockOnly: false }).slice(0, 6) : []), [items, query]);

  async function submit() {
    let linked = false;
    const ok = await save.run(async () => {
      const result = await saveSelection({
        title: title.trim(),
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        site_note: siteNote.trim() || undefined,
        items: picked.map((item) => ({ key: item.key, quantity: item.quantity }))
      });
      linked = Boolean(result.data?.linked_customer);
      return { error: result.error };
    });
    if (ok) {
      setTitle("");
      setCustomerName("");
      setCustomerPhone("");
      setSiteNote("");
      setPicked([]);
      onSaved();
      Alert.alert(
        "Selection saved",
        linked ? "The customer has the app, so it is already in their Selections." : "The customer is not on the app with that number yet — share it on WhatsApp from the list."
      );
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>New selection</Text>
      <Text style={styles.muted}>Pick products for a customer&apos;s job. They order in one tap and you earn incentives when it is delivered.</Text>
      <Field label="Name" value={title} onChangeText={setTitle} placeholder="e.g. Sharma house – switches" />
      <Field label="Customer name" value={customerName} onChangeText={setCustomerName} placeholder="Optional" />
      <Field label="Customer mobile" value={customerPhone} onChangeText={setCustomerPhone} placeholder="Links it to their app" keyboardType="phone-pad" icon="phone" />
      <Field label="Site / note" value={siteNote} onChangeText={setSiteNote} placeholder="e.g. 2nd floor, white modular" />
      <Field label="Add products" value={query} onChangeText={setQuery} placeholder="Search wires, switches, MCBs…" icon="search" autoCapitalize="none" />
      {matches.map((item) => {
        const added = picked.some((line) => line.key === item.key);
        return (
          <Pressable
            key={item.key}
            style={styles.match}
            disabled={added}
            onPress={() => {
              setPicked([...picked, { key: item.key, name: item.name, quantity: 1 }]);
              setQuery("");
            }}
          >
            <Text style={{ flex: 1, color: palette.ink }}>{item.name}</Text>
            <Text style={styles.link}>{added ? "Added" : "Add"}</Text>
          </Pressable>
        );
      })}
      {picked.map((line) => (
        <View key={line.key} style={styles.line}>
          <Text style={styles.lineName}>{line.name}</Text>
          <TextInput
            value={String(line.quantity)}
            onChangeText={(text) => {
              const quantity = Number(text.replace(/\D/g, "")) || 0;
              setPicked(quantity ? picked.map((item) => (item.key === line.key ? { ...item, quantity } : item)) : picked.filter((item) => item.key !== line.key));
            }}
            keyboardType="number-pad"
            style={styles.qty}
            accessibilityLabel={`Quantity of ${line.name}`}
          />
        </View>
      ))}
      {save.error ? <Notice message={save.error} tone="error" /> : null}
      <AppButton label={save.loading ? "Saving..." : "Save & share"} icon="send" loading={save.loading} disabled={!picked.length || title.trim().length < 3} onPress={() => void submit()} />
    </View>
  );
}

export function SelectionsScreen() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<"active" | "ordered" | "closed">("active");
  const action = useMutationAction();
  const selections = useRows<SelectionList>(async () => {
    const result = await listSelections();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);
  const role = selections.data[0]?.role;
  const all = selections.data[0]?.selections ?? [];
  const list = role === "admin" ? all.filter((selection) => selection.status === filter) : all;
  const from = `${profile?.full_name ?? "your electrician"}${profile?.role ? ` (${profile.role})` : ""}`;

  return (
    <ScreenShell
      title={role === "customer" ? "Selections" : "Product selections"}
      subtitle={role === "customer" ? "Products your electrician or architect picked for you" : role === "admin" ? "What professionals picked for customers" : "Pick products for a customer's job"}
      currentScreen="selections"
    >
      {role === "partner" ? <SelectionForm onSaved={() => selections.refetch?.()} /> : null}
      {role === "admin" ? (
        <View style={styles.row}>
          {(["active", "ordered", "closed"] as const).map((status) => (
            <Chip key={status} label={`${SELECTION_STATUS_LABELS[status]} ${all.filter((selection) => selection.status === status).length}`} active={filter === status} onPress={() => setFilter(status)} />
          ))}
        </View>
      ) : null}
      {action.error ? <Notice message={action.error} tone="error" /> : null}
      <QueryState
        loading={selections.loading}
        error={selections.error}
        hasData={list.length > 0}
        empty={role === "customer" ? "When your electrician or architect picks products for you using your phone number, they appear here." : "No selections yet."}
      >
        {list.map((selection) => (
          <View key={selection.id} style={styles.card}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heading}>{selection.title}</Text>
                <Text style={styles.muted}>
                  {selection.selection_number} · {new Date(selection.created_at).toLocaleDateString("en-IN")}
                </Text>
              </View>
              <Text style={[styles.pill, selection.status === "ordered" ? styles.pillDone : selection.status === "closed" ? styles.pillClosed : styles.pillOpen]}>
                {SELECTION_STATUS_LABELS[selection.status]}
              </Text>
            </View>
            {role !== "partner" && selection.created_by ? (
              <Text style={styles.muted}>
                Selected by <Text style={styles.strong}>{selection.created_by.full_name}</Text> ({selection.created_by.role})
              </Text>
            ) : null}
            {role !== "customer" ? (
              <Text style={styles.muted}>
                For {selection.customer_name || "a customer"}
                {selection.customer_phone ? ` · ${selection.customer_phone}` : ""} · {selection.customer_linked ? "in their app" : "not on the app yet"}
              </Text>
            ) : null}
            {selection.site_note ? <Text style={styles.muted}>Note: {selection.site_note}</Text> : null}
            <Items selection={selection} showPrices={role === "admin"} />
            {role === "admin" && selection.estimated_total !== undefined ? (
              <Text style={styles.strong}>Worth about {formatPriceListAmount(selection.estimated_total)} today</Text>
            ) : null}
            <Activity selection={selection} />
            {role === "customer" ? <OrderOrQuote selection={selection} onDone={() => selections.refetch?.()} /> : null}
            {role === "partner" ? (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <AppButton label="WhatsApp" icon="share-2" kind="secondary" onPress={() => void shareOnWhatsApp(selection, from)} />
                </View>
                {selection.status !== "closed" ? (
                  <View style={{ flex: 1 }}>
                    <AppButton
                      label="Close"
                      icon="x"
                      kind="secondary"
                      onPress={() =>
                        Alert.alert(`Close ${selection.selection_number}?`, undefined, [
                          { text: "Keep", style: "cancel" },
                          { text: "Close", style: "destructive", onPress: () => void action.run(() => closeSelection(selection.id)).then(() => selections.refetch?.()) }
                        ])
                      }
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ))}
      </QueryState>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    padding: 16,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    ...shadow
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  heading: { fontSize: 16, fontWeight: "900", color: palette.ink },
  strong: { fontWeight: "800", color: palette.ink },
  muted: { color: palette.muted, fontSize: 13, lineHeight: 18 },
  link: { color: palette.brand, fontWeight: "800" },
  pill: { overflow: "hidden", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: "800" },
  pillOpen: { color: palette.teal, backgroundColor: palette.tealSoft },
  pillDone: { color: palette.success, backgroundColor: palette.successSoft },
  pillClosed: { color: palette.danger, backgroundColor: palette.dangerSoft },
  line: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  lineName: { flex: 1, color: palette.ink, fontSize: 14 },
  lineQty: { fontWeight: "800", color: palette.ink, fontSize: 14 },
  qty: { minWidth: 56, height: 38, paddingHorizontal: 8, textAlign: "center", borderRadius: radii.sm, borderWidth: 1, borderColor: palette.line, color: palette.ink, fontWeight: "800" },
  match: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.sm, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surfaceSoft, color: palette.ink }
});
