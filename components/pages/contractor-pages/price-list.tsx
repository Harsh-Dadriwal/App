"use client";

import { useEffect, useMemo, useState } from "react";
import { FormNotice, ListSearchField, PageSection, QueryState, useMutationAction, useRows } from "@/components/data-view";
import { getServeUrl } from "@/lib/s3";
import { getPriceList, savePriceListCategoryImage, syncPriceList } from "@/lib/backend/modules/inventory-gateway";
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
const MAX_VISIBLE_ITEMS = 200;
const CUSTOMER_VIEW_SWATCHES = [
  { background: "#7c2d12", color: "#fff7ed" },
  { background: "#0f766e", color: "#f0fdfa" },
  { background: "#111827", color: "#f8fafc" },
  { background: "#fff4dc", color: "#1f1a14" },
  { background: "#ccfbf1", color: "#134e4a" },
  { background: "#f7f1e8", color: "#1f1a14" }
];

function matches(value: string, term: string) {
  return !term || value.toLowerCase().includes(term);
}

export function AdminPriceListPage() {
  const [chosenScope, setScope] = useState<Scope>("category");
  const [search, setSearch] = useState("");
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [selectedItem, setSelectedItem] = useState<PriceListItem | null>(null);
  const sync = useMutationAction();
  const imageUpload = useMutationAction();

  const priceList = useRows<PriceList>(async () => {
    const result = await getPriceList();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);

  const source = priceList.data[0];
  // Some Tally exports carry no category or group; then there is nothing to browse but items.
  const hasGroupings = (source?.items ?? []).some((item) => item.category || item.group_name);
  const scope: Scope = hasGroupings ? chosenScope : "item";
  const categoryImages = source?.categoryImages ?? {};
  const items = useMemo(() => {
    const all = source?.items ?? [];
    return hideOutOfStock ? all.filter((item) => !isPriceListItemOutOfStock(item)) : all;
  }, [source, hideOutOfStock]);
  const term = search.trim().toLowerCase();

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, { category: string; count: number }>();
    for (const item of items) {
      const entry = byGroup.get(item.group_name);
      if (entry) entry.count += 1;
      else byGroup.set(item.group_name, { category: item.category, count: 1 });
    }
    return [...byGroup].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const drilledItems = useMemo(
    () => drill
      ? items.filter((item) =>
          (drill.category === undefined || item.category === drill.category) &&
          (drill.group === undefined || item.group_name === drill.group))
      : [],
    [items, drill]
  );
  const visibleCategories = categories.filter(([name]) => matches(name, term));
  const visibleGroups = groups.filter(([name]) => matches(name, term));
  const visibleItems = drill ? drilledItems : items.filter((item) => matches(item.item_name, term));

  function openDrill(next: Drill) {
    setSearch("");
    setDrill(next);
  }

  async function handleSync() {
    await sync.run(() => syncPriceList(), "Price list updated from the latest Tally export.");
  }

  async function handleCategoryImage(category: string, file: File | undefined) {
    if (!file) return;
    await imageUpload.run(async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productSku", `price-list-${category}`);
      const response = await fetch("/api/admin/upload-product-image", { method: "POST", body: formData });
      const uploaded = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !uploaded.url) {
        return { error: { message: uploaded.error ?? "Image upload failed." } };
      }
      return savePriceListCategoryImage(category, uploaded.url);
    }, `Image saved for ${category}.`);
  }

  const showingItems = Boolean(drill) || scope === "item";
  const emptySearch = showingItems ? visibleItems.length === 0 : scope === "category" ? visibleCategories.length === 0 : visibleGroups.length === 0;
  const otherScopes = hasGroupings ? SCOPES.filter((option) => option.id !== scope) : [];

  return (
    <div className="page-stack">
      <PageSection
        title={drill ? drill.title : "Price list"}
        description={
          drill
            ? `${drilledItems.length} item${drilledItems.length === 1 ? "" : "s"}. Select an item to show its price to a customer.`
            : "Retail prices and stock from your latest Tally export. Select an item to show its price to a customer."
        }
      >
        <div className="price-list-toolbar">
          {drill ? (
            <button type="button" className="secondary-button" onClick={() => setDrill(null)}>
              Back to price list
            </button>
          ) : !hasGroupings ? null : (
            <div className="segmented-control" role="tablist" aria-label="Browse price list by">
              {SCOPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={scope === option.id}
                  className={scope === option.id ? "is-active" : ""}
                  onClick={() => setScope(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <label className="price-list-toggle">
            <input type="checkbox" checked={hideOutOfStock} onChange={(event) => setHideOutOfStock(event.target.checked)} />
            Hide out of stock
          </label>
          <button
            type="button"
            className="primary-button"
            disabled={sync.isSubmitting || source?.configured === false}
            onClick={() => void handleSync()}
          >
            {sync.isSubmitting ? "Updating..." : "Update from Tally"}
          </button>
        </div>

        {source ? (
          <p className="form-field-hint">
            {source.syncedAt
              ? `Last updated ${new Date(source.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.`
              : "Not updated yet."}
            {source.configured ? "" : " The price list source is not set up yet. Please contact support."}
          </p>
        ) : null}
        <FormNotice error={sync.error} success={sync.success} />
        <FormNotice error={imageUpload.error} success={imageUpload.success} />

        {!drill ? (
          <ListSearchField
            value={search}
            onChange={setSearch}
            placeholder={`Search ${SCOPES.find((option) => option.id === scope)?.label.toLowerCase()}`}
            ariaLabel="Search price list"
          />
        ) : null}

        <QueryState
          loading={priceList.loading}
          error={priceList.error}
          hasData={(source?.items.length ?? 0) > 0}
          empty={{ title: "No price list yet", description: "Select Update from Tally to load the latest prices and stock." }}
        >
          {emptySearch ? (
            <div className="state-card">
              <strong>{term ? `Nothing matches "${search.trim()}"` : "No items to show"}</strong>
              {term && !drill && otherScopes.length ? (
                <p>
                  Try searching{" "}
                  {otherScopes.map((option, index) => (
                    <span key={option.id}>
                      {index > 0 ? " or " : ""}
                      <button type="button" className="text-link-button" onClick={() => setScope(option.id)}>
                        {option.label}
                      </button>
                    </span>
                  ))}{" "}
                  instead.
                </p>
              ) : (
                <p>Turn off Hide out of stock to see every item.</p>
              )}
            </div>
          ) : showingItems ? (
            <>
              <div className="price-list-rows">
                {visibleItems.slice(0, MAX_VISIBLE_ITEMS).map((item, index) => (
                  <button
                    key={`${item.category}|${item.group_name}|${item.item_name}|${index}`}
                    type="button"
                    className="price-list-row"
                    onClick={() => setSelectedItem(item)}
                  >
                    <span className="price-list-row-main">
                      <strong>{item.item_name}</strong>
                      <span>{[item.category, item.group_name].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="price-list-row-price">
                      {item.mrp > item.final_price ? <s>{formatPriceListAmount(item.mrp)}</s> : null}
                      <strong>{formatPriceListAmount(item.final_price)}</strong>
                      {item.cost_price !== undefined ? <span>Cost {formatPriceListAmount(item.cost_price)}</span> : null}
                    </span>
                    <span className={`badge${isPriceListItemOutOfStock(item) ? " price-list-badge--out" : ""}`}>
                      {item.stock_label || "Stock not reported"}
                    </span>
                  </button>
                ))}
              </div>
              {visibleItems.length > MAX_VISIBLE_ITEMS ? (
                <p className="form-field-hint">
                  Showing the first {MAX_VISIBLE_ITEMS} of {visibleItems.length} items. Search to narrow the list.
                </p>
              ) : null}
            </>
          ) : scope === "category" ? (
            <div className="price-list-rows">
              {visibleCategories.map(([name, count]) => (
                <div key={name} className="price-list-row price-list-row--split">
                  <button type="button" className="price-list-row-open" onClick={() => openDrill({ title: name || "Uncategorised", category: name })}>
                    {categoryImages[name] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="price-list-thumb" src={getServeUrl(categoryImages[name])} alt="" />
                    ) : (
                      <span className="price-list-thumb" aria-hidden="true" />
                    )}
                    <span className="price-list-row-main">
                      <strong>{name || "Uncategorised"}</strong>
                      <span>{count} item{count === 1 ? "" : "s"}</span>
                    </span>
                  </button>
                  <label className={`secondary-button${imageUpload.isSubmitting ? " is-disabled" : ""}`}>
                    {categoryImages[name] ? "Change image" : "Add image"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      disabled={imageUpload.isSubmitting}
                      onChange={(event) => {
                        void handleCategoryImage(name, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <div className="price-list-rows">
              {visibleGroups.map(([name, group]) => (
                <button key={name} type="button" className="price-list-row" onClick={() => openDrill({ title: name || "Ungrouped", group: name })}>
                  <span className="price-list-row-main">
                    <strong>{name || "Ungrouped"}</strong>
                    <span>{[group.category, `${group.count} item${group.count === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </QueryState>
      </PageSection>

      {selectedItem ? (
        <CustomerPriceView
          item={selectedItem}
          imageUrl={categoryImages[selectedItem.category]}
          onClose={() => setSelectedItem(null)}
        />
      ) : null}
    </div>
  );
}

/** Customer-facing: the salesperson turns the screen around, so no cost price and large type. */
function CustomerPriceView({ item, imageUrl, onClose }: { item: PriceListItem; imageUrl?: string; onClose: () => void }) {
  const [swatch] = useState(() => CUSTOMER_VIEW_SWATCHES[Math.floor(Math.random() * CUSTOMER_VIEW_SWATCHES.length)]);
  const savings = item.mrp - item.final_price;

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="price-view" role="dialog" aria-modal="true" aria-label={`Price for ${item.item_name}`} style={swatch}>
      <button type="button" className="price-view-close" onClick={onClose} autoFocus>
        Back
      </button>
      <div className="price-view-body">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="price-view-image" src={getServeUrl(imageUrl)} alt={item.category} />
        ) : null}
        <h2>{item.item_name}</h2>
        <p className="price-view-meta">{[item.category, item.group_name].filter(Boolean).join(" · ")}</p>
        {savings > 0 ? <p className="price-view-mrp">MRP <s>{formatPriceListAmount(item.mrp)}</s></p> : null}
        <p className="price-view-price">{formatPriceListAmount(item.final_price)}</p>
        {savings > 0 ? <p className="price-view-savings">You save {formatPriceListAmount(savings)}</p> : null}
      </div>
    </div>
  );
}
