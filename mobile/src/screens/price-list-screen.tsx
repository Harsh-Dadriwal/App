import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { AppButton, Card, Chip, Field, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { palette } from "@/lib/theme";
import { getPriceList, syncPriceList } from "@/lib/backend/inventory-gateway";
import {
  formatPriceListAmount,
  isPriceListItemOutOfStock,
  type PriceList,
  type PriceListItem
} from "@mahalaxmi/core/gateway/inventory-gateway";

type Scope = "category" | "group" | "item";
type Drill = { title: string; category?: string; group?: string };

const SCOPES: Array<{ id: Scope; label: string }> = [
  { id: "category", label: "Categories" },
  { id: "group", label: "Groups" },
  { id: "item", label: "Items" }
];
const MAX_VISIBLE_ROWS = 100;
const CUSTOMER_VIEW_SWATCHES = [
  { background: "#7c2d12", color: "#fff7ed" },
  { background: "#0f766e", color: "#f0fdfa" },
  { background: "#111827", color: "#f8fafc" },
  { background: "#fff4dc", color: "#1f1a14" },
  { background: "#ccfbf1", color: "#134e4a" }
];

function matches(value: string, term: string) {
  return !term || value.toLowerCase().includes(term);
}

export function PriceListScreen() {
  const [priceList, setPriceList] = useState<PriceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [chosenScope, setScope] = useState<Scope>("category");
  const [query, setQuery] = useState("");
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [selected, setSelected] = useState<{ item: PriceListItem; swatch: (typeof CUSTOMER_VIEW_SWATCHES)[number] } | null>(null);

  const load = useCallback(async () => {
    const result = await getPriceList();
    if (result.data) setPriceList(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setNotice(null);
    const result = await syncPriceList();
    if (result.error) {
      setNotice({ message: result.error, tone: "error" });
    } else {
      setNotice({ message: "Price list updated from the latest Tally export.", tone: "success" });
      await load();
    }
    setSyncing(false);
  }

  const items = useMemo(() => {
    const all = priceList?.items ?? [];
    return hideOutOfStock ? all.filter((item) => !isPriceListItemOutOfStock(item)) : all;
  }, [priceList, hideOutOfStock]);
  // Some Tally exports carry no category or group; then there is nothing to browse but items.
  const hasGroupings = (priceList?.items ?? []).some((item) => item.category || item.group_name);
  const scope: Scope = hasGroupings ? chosenScope : "item";
  const term = query.trim().toLowerCase();

  const navRows = useMemo(() => {
    const rows = new Map<string, { category: string; count: number }>();
    for (const item of items) {
      const key = scope === "group" ? item.group_name : item.category;
      const row = rows.get(key);
      if (row) row.count += 1;
      else rows.set(key, { category: item.category, count: 1 });
    }
    return [...rows].filter(([name]) => matches(name, term)).sort(([a], [b]) => a.localeCompare(b));
  }, [items, scope, term]);
  const visibleItems = useMemo(
    () => drill
      ? items.filter((item) =>
          (drill.category === undefined || item.category === drill.category) &&
          (drill.group === undefined || item.group_name === drill.group))
      : items.filter((item) => matches(item.item_name, term)),
    [items, drill, term]
  );

  const showingItems = Boolean(drill) || scope === "item";
  const rowCount = showingItems ? visibleItems.length : navRows.length;

  return (
    <ScreenShell
      title={drill ? drill.title : "Price list"}
      subtitle="Retail prices and stock from your latest Tally export. Tap an item to show its price to a customer."
      currentScreen="price-list"
      showBack
    >
      <Card tone="brand">
        {drill ? (
          <AppButton label="Back to price list" icon="arrow-left" kind="secondary" onPress={() => setDrill(null)} />
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, display: hasGroupings ? "flex" : "none" }}>
              {SCOPES.map((option) => (
                <Chip key={option.id} label={option.label} active={scope === option.id} onPress={() => setScope(option.id)} />
              ))}
            </View>
            <Field
              label={`Search ${SCOPES.find((option) => option.id === scope)?.label.toLowerCase()}`}
              value={query}
              onChangeText={setQuery}
              placeholder="Type to search"
            />
          </>
        )}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <Chip label="Hide out of stock" active={hideOutOfStock} onPress={() => setHideOutOfStock((value) => !value)} />
        </View>
        <View style={{ marginTop: 12 }}>
          <AppButton
            label={syncing ? "Updating..." : "Update from Tally"}
            icon="refresh-cw"
            disabled={syncing || priceList?.configured === false}
            onPress={() => void handleSync()}
          />
        </View>
        {priceList?.syncedAt ? (
          <Text style={{ marginTop: 10, color: palette.muted }}>
            Last updated {new Date(priceList.syncedAt).toLocaleString("en-IN")}
          </Text>
        ) : null}
      </Card>

      {notice ? <Notice message={notice.message} tone={notice.tone} /> : null}

      <SectionTitle title={showingItems ? "Items" : scope === "group" ? "Groups" : "Categories"} description={`${rowCount} found`} />
      <QueryState
        loading={loading}
        error={error}
        hasData={rowCount > 0}
        empty={
          (priceList?.items.length ?? 0) === 0
            ? "No price list yet. Tap Update from Tally to load the latest prices and stock."
            : "Nothing matches. Try another tab or a different search."
        }
      >
        {showingItems
          ? visibleItems.slice(0, MAX_VISIBLE_ROWS).map((item, index) => (
              <Pressable
                key={`${item.category}|${item.group_name}|${item.item_name}|${index}`}
                onPress={() => setSelected({ item, swatch: CUSTOMER_VIEW_SWATCHES[Math.floor(Math.random() * CUSTOMER_VIEW_SWATCHES.length)] })}
              >
                <Card>
                  <Text style={{ fontSize: 16, fontWeight: "700" }}>{item.item_name}</Text>
                  <Text style={{ marginTop: 2, color: palette.muted }}>{[item.category, item.group_name].filter(Boolean).join(" · ")}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                    {item.mrp > item.final_price ? (
                      <Text style={{ color: palette.muted, textDecorationLine: "line-through" }}>{formatPriceListAmount(item.mrp)}</Text>
                    ) : null}
                    <Text style={{ fontWeight: "700" }}>{formatPriceListAmount(item.final_price)}</Text>
                    <Text style={{ color: isPriceListItemOutOfStock(item) ? palette.danger : palette.muted }}>
                      {item.stock_label || "Stock not reported"}
                    </Text>
                  </View>
                  {item.cost_price !== undefined ? (
                    <Text style={{ marginTop: 4, color: palette.teal }}>Cost {formatPriceListAmount(item.cost_price)}</Text>
                  ) : null}
                </Card>
              </Pressable>
            ))
          : navRows.slice(0, MAX_VISIBLE_ROWS).map(([name, row]) => (
              <Pressable
                key={name}
                onPress={() => {
                  setQuery("");
                  setDrill(scope === "group" ? { title: name || "Ungrouped", group: name } : { title: name || "Uncategorised", category: name });
                }}
              >
                <Card tone="soft">
                  <Text style={{ fontSize: 16, fontWeight: "700" }}>{name || (scope === "group" ? "Ungrouped" : "Uncategorised")}</Text>
                  <Text style={{ marginTop: 2, color: palette.muted }}>
                    {[scope === "group" ? row.category : null, `${row.count} item${row.count === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                  </Text>
                </Card>
              </Pressable>
            ))}
        {rowCount > MAX_VISIBLE_ROWS ? (
          <Text style={{ color: palette.muted, textAlign: "center" }}>
            Showing the first {MAX_VISIBLE_ROWS} of {rowCount}. Search to narrow the list.
          </Text>
        ) : null}
      </QueryState>

      {/* Customer-facing: the salesperson hands over the phone, so no cost price and large type. */}
      <Modal visible={Boolean(selected)} animationType="fade" onRequestClose={() => setSelected(null)}>
        {selected ? (
          <View style={{ flex: 1, backgroundColor: selected.swatch.background }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 56 }}>
              <Pressable
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderWidth: 1, borderRadius: 999, borderColor: selected.swatch.color }}
              >
                <Text style={{ color: selected.swatch.color, fontWeight: "700" }}>Back</Text>
              </Pressable>
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
                {priceList?.categoryImages[selected.item.category] ? (
                  <Image
                    source={{ uri: priceList.categoryImages[selected.item.category] }}
                    style={{ width: 240, height: 240, marginBottom: 16 }}
                    resizeMode="contain"
                  />
                ) : null}
                <Text style={{ color: selected.swatch.color, fontSize: 24, fontWeight: "800", textAlign: "center" }}>{selected.item.item_name}</Text>
                <Text style={{ color: selected.swatch.color, opacity: 0.75, textAlign: "center" }}>
                  {[selected.item.category, selected.item.group_name].filter(Boolean).join(" · ")}
                </Text>
                {selected.item.mrp > selected.item.final_price ? (
                  <Text style={{ color: selected.swatch.color, opacity: 0.75, fontSize: 20, marginTop: 16, textDecorationLine: "line-through" }}>
                    MRP {formatPriceListAmount(selected.item.mrp)}
                  </Text>
                ) : null}
                <Text style={{ color: selected.swatch.color, fontSize: 56, fontWeight: "800" }}>{formatPriceListAmount(selected.item.final_price)}</Text>
                {selected.item.mrp > selected.item.final_price ? (
                  <Text style={{ color: selected.swatch.color, fontSize: 18, fontWeight: "700" }}>
                    You save {formatPriceListAmount(selected.item.mrp - selected.item.final_price)}
                  </Text>
                ) : null}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </ScreenShell>
  );
}
