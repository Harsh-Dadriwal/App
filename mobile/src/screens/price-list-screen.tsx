import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, Chip, Field, Notice, QueryState, ScreenShell } from "@/components/ui";
import { palette, radii, shadow } from "@/lib/theme";
import { getPriceList, syncPriceList } from "@/lib/backend/inventory-gateway";
import { formatPriceListAmount, type PriceList, type PriceListItem } from "@mahalaxmi/core/gateway/inventory-gateway";
import {
  PRICE_LIST_SORT_LABELS,
  countBy,
  filterPriceList,
  indexPriceList,
  type IndexedPriceListItem,
  type PriceListSort,
  type PriceListStockFilter
} from "@mahalaxmi/core/gateway/price-list-taxonomy";

type Item = IndexedPriceListItem<PriceListItem>;

const PAGE_SIZE = 40;
const SORTS = Object.keys(PRICE_LIST_SORT_LABELS) as PriceListSort[];
const STOCK_FILTERS: Array<{ id: PriceListStockFilter; label: string }> = [
  { id: "all", label: "All stock" },
  { id: "in", label: "In stock" },
  { id: "out", label: "Out of stock" }
];
const CUSTOMER_VIEW_SWATCHES = [
  { background: "#7c2d12", color: "#fff7ed" },
  { background: "#0f766e", color: "#f0fdfa" },
  { background: "#1f1712", color: "#f6ede2" },
  { background: "#134e4a", color: "#ecfdf5" }
];

function stockStyle(item: Item) {
  if (item.outOfStock) return { color: palette.danger, background: palette.dangerSoft, label: "Out of stock" };
  if (item.stockQty !== null && item.stockQty <= 2) return { color: palette.brandDeep, background: palette.brandSoft, label: item.stock_label };
  return { color: palette.success, background: palette.successSoft, label: item.stock_label || "In stock" };
}

export function PriceListScreen() {
  const [priceList, setPriceList] = useState<PriceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [stock, setStock] = useState<PriceListStockFilter>("all");
  const [sort, setSort] = useState<PriceListSort>("relevance");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [swatch, setSwatch] = useState(CUSTOMER_VIEW_SWATCHES[0]);

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

  const allItems = useMemo(() => indexPriceList(priceList?.items ?? []), [priceList]);
  const showCost = allItems.some((item) => item.cost_price !== undefined);
  const categories = useMemo(() => countBy(allItems, (item) => item.displayCategory), [allItems]);
  const brands = useMemo(
    () => countBy(allItems.filter((item) => !category || item.displayCategory === category), (item) => item.brand).slice(0, 20),
    [allItems, category]
  );
  const results = useMemo(
    () => filterPriceList(allItems, { query, category, brand, stock, sort }),
    [allItems, query, category, brand, stock, sort]
  );
  const visible = results.slice(0, visibleCount);
  const filtersActive = Boolean(query.trim() || category || brand || stock !== "all");

  useEffect(() => setVisibleCount(PAGE_SIZE), [query, category, brand, stock, sort]);

  function openItem(index: number) {
    setSwatch(CUSTOMER_VIEW_SWATCHES[Math.floor(Math.random() * CUSTOMER_VIEW_SWATCHES.length)]);
    setSelectedIndex(index);
  }

  function clearFilters() {
    setQuery("");
    setCategory(null);
    setBrand(null);
    setStock("all");
    setSort("relevance");
  }

  const selected = selectedIndex !== null ? visible[selectedIndex] : undefined;
  const selectedImage = selected ? priceList?.categoryImages[selected.displayCategory] ?? priceList?.categoryImages[selected.category] : undefined;

  return (
    <ScreenShell
      title="Price list"
      subtitle={`${allItems.length.toLocaleString("en-IN")} items from Tally${
        priceList?.syncedAt ? ` · updated ${new Date(priceList.syncedAt).toLocaleDateString("en-IN")}` : ""
      }`}
      currentScreen="price-list"
      showBack
    >
      <Field label="Search" value={query} onChangeText={setQuery} placeholder="e.g. 12w panel havells" icon="search" autoCapitalize="none" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label={`All ${allItems.length}`} active={!category} onPress={() => { setCategory(null); setBrand(null); }} />
        {categories.map(([name, count]) => (
          <Chip
            key={name}
            label={`${name} ${count}`}
            active={category === name}
            onPress={() => { setCategory(category === name ? null : name); setBrand(null); }}
          />
        ))}
      </ScrollView>

      {brands.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="All brands" active={!brand} onPress={() => setBrand(null)} />
          {brands.map(([name, count]) => (
            <Chip key={name} label={`${name} ${count}`} active={brand === name} onPress={() => setBrand(brand === name ? null : name)} />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {STOCK_FILTERS.map((option) => (
          <Chip key={option.id} label={option.label} active={stock === option.id} onPress={() => setStock(option.id)} />
        ))}
        <Chip
          label={`Sort: ${PRICE_LIST_SORT_LABELS[sort]}`}
          active={sort !== "relevance"}
          onPress={() => setSort(SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length])}
        />
      </ScrollView>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          <Text style={styles.summaryCount}>{results.length.toLocaleString("en-IN")}</Text> items{category ? ` in ${category}` : ""}
        </Text>
        {filtersActive ? (
          <Pressable onPress={clearFilters} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      {notice ? <Notice message={notice.message} tone={notice.tone} /> : null}

      <QueryState
        loading={loading}
        error={error}
        hasData={results.length > 0}
        empty={allItems.length ? "No items match. Try fewer words or clear the filters." : "No price list yet. Tap Update from Tally below."}
      >
        {visible.map((item, index) => {
          const tone = stockStyle(item);
          return (
            <Pressable
              key={`${item.item_name}|${index}`}
              onPress={() => openItem(index)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              accessibilityRole="button"
              accessibilityLabel={`${item.displayName}, ${formatPriceListAmount(item.final_price)}`}
            >
              <Text style={styles.cardMeta} numberOfLines={1}>
                {item.brand ? <Text style={styles.cardBrand}>{item.brand.toUpperCase()} · </Text> : null}
                {item.displayCategory.toUpperCase()}
              </Text>
              <Text style={styles.cardName} numberOfLines={2}>{item.displayName}</Text>
              <View style={styles.cardBottom}>
                <View>
                  <Text style={styles.cardPrice}>{item.final_price ? formatPriceListAmount(item.final_price) : "Price on request"}</Text>
                  {item.mrp > item.final_price ? <Text style={styles.cardMrp}>{formatPriceListAmount(item.mrp)}</Text> : null}
                  {showCost && item.cost_price ? <Text style={styles.cardCost}>Cost {formatPriceListAmount(item.cost_price)}</Text> : null}
                </View>
                <Text style={[styles.stockPill, { color: tone.color, backgroundColor: tone.background }]}>{tone.label}</Text>
              </View>
            </Pressable>
          );
        })}
        {results.length > visible.length ? (
          <AppButton
            label={`Show more (${(results.length - visible.length).toLocaleString("en-IN")} left)`}
            kind="secondary"
            icon="chevron-down"
            onPress={() => setVisibleCount((count) => count + PAGE_SIZE)}
          />
        ) : null}
      </QueryState>

      {showCost ? (
        <AppButton
          label={syncing ? "Updating..." : "Update from Tally"}
          icon="refresh-cw"
          kind="secondary"
          loading={syncing}
          disabled={priceList?.configured === false}
          onPress={() => void handleSync()}
        />
      ) : null}

      {/* Customer-facing: the salesperson hands over the phone, so no cost price and large type. */}
      <Modal visible={Boolean(selected)} animationType="fade" onRequestClose={() => setSelectedIndex(null)}>
        {selected ? (
          <SafeAreaView style={[styles.view, { backgroundColor: swatch.background }]}>
            <View style={styles.viewBar}>
              <Pressable
                onPress={() => setSelectedIndex(null)}
                accessibilityRole="button"
                accessibilityLabel="Back to list"
                style={[styles.viewButton, { borderColor: swatch.color }]}
              >
                <Feather name="arrow-left" size={18} color={swatch.color} />
                <Text style={[styles.viewButtonText, { color: swatch.color }]}>Back</Text>
              </Pressable>
              <Text style={{ color: swatch.color, opacity: 0.75 }}>{`${(selectedIndex ?? 0) + 1} of ${visible.length}`}</Text>
            </View>
            <ScrollView contentContainerStyle={styles.viewBody}>
              {selectedImage ? <Image source={{ uri: selectedImage }} style={styles.viewImage} resizeMode="contain" /> : null}
              <Text style={[styles.viewMeta, { color: swatch.color }]}>{[selected.brand, selected.displayCategory].filter(Boolean).join(" · ").toUpperCase()}</Text>
              <Text style={[styles.viewName, { color: swatch.color }]}>{selected.displayName}</Text>
              {selected.mrp > selected.final_price ? (
                <Text style={[styles.viewMrp, { color: swatch.color }]}>MRP {formatPriceListAmount(selected.mrp)}</Text>
              ) : null}
              <Text style={[styles.viewPrice, { color: swatch.color }]} adjustsFontSizeToFit numberOfLines={1}>
                {selected.final_price ? formatPriceListAmount(selected.final_price) : "Price on request"}
              </Text>
              {selected.mrp > selected.final_price ? (
                <Text style={[styles.viewSavings, { color: swatch.color }]}>You save {formatPriceListAmount(selected.mrp - selected.final_price)}</Text>
              ) : null}
              <Text style={{ color: swatch.color, opacity: 0.75, marginTop: 8 }}>{selected.outOfStock ? "Currently out of stock" : "In stock"}</Text>
            </ScrollView>
            <View style={styles.viewNav}>
              {[
                { label: "Previous", icon: "chevron-left" as const, target: (selectedIndex ?? 0) - 1 },
                { label: "Next", icon: "chevron-right" as const, target: (selectedIndex ?? 0) + 1 }
              ].map((nav) => {
                const enabled = nav.target >= 0 && nav.target < visible.length;
                return (
                  <Pressable
                    key={nav.label}
                    onPress={() => enabled && setSelectedIndex(nav.target)}
                    disabled={!enabled}
                    accessibilityRole="button"
                    accessibilityLabel={`${nav.label} item`}
                    style={[styles.viewButton, { borderColor: swatch.color, opacity: enabled ? 1 : 0.35 }]}
                  >
                    {nav.label === "Previous" ? <Feather name={nav.icon} size={18} color={swatch.color} /> : null}
                    <Text style={[styles.viewButtonText, { color: swatch.color }]}>{nav.label}</Text>
                    {nav.label === "Next" ? <Feather name={nav.icon} size={18} color={swatch.color} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </SafeAreaView>
        ) : null}
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: 8, paddingRight: 8 },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  summaryText: { color: palette.muted, fontSize: 14 },
  summaryCount: { color: palette.ink, fontWeight: "800" },
  link: { color: palette.brand, fontWeight: "800" },
  card: {
    padding: 16,
    gap: 6,
    borderRadius: radii.lg,
    backgroundColor: palette.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.line,
    ...shadow
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  cardMeta: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3, color: palette.muted },
  cardBrand: { color: palette.brand },
  cardName: { fontSize: 16, fontWeight: "800", color: palette.ink, lineHeight: 21 },
  cardBottom: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: 4 },
  cardPrice: { fontSize: 20, fontWeight: "900", color: palette.ink },
  cardMrp: { fontSize: 12.5, color: palette.muted, textDecorationLine: "line-through" },
  cardCost: { fontSize: 12.5, color: palette.teal, fontWeight: "600" },
  stockPill: { overflow: "hidden", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 12, fontWeight: "800" },
  view: { flex: 1, paddingHorizontal: 18 },
  viewBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 },
  viewButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 46,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderRadius: 999
  },
  viewButtonText: { fontSize: 16, fontWeight: "800" },
  viewBody: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingVertical: 24, gap: 8 },
  viewImage: { width: 220, height: 220, marginBottom: 8 },
  viewMeta: { fontSize: 13, fontWeight: "800", letterSpacing: 0.6, opacity: 0.8 },
  viewName: { fontSize: 26, fontWeight: "900", textAlign: "center", lineHeight: 32 },
  viewMrp: { fontSize: 19, opacity: 0.75, marginTop: 12, textDecorationLine: "line-through" },
  viewPrice: { fontSize: 72, fontWeight: "900" },
  viewSavings: { fontSize: 19, fontWeight: "800" },
  viewNav: { flexDirection: "row", justifyContent: "center", gap: 14, paddingBottom: 12 }
});
