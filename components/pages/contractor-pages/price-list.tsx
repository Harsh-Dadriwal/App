"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FormNotice, QueryState, useMutationAction, useRows } from "@/components/data-view";
import { getServeUrl } from "@/lib/s3";
import { getPriceList, savePriceListCategoryImage, syncPriceList } from "@/lib/backend/modules/inventory-gateway";
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

const PAGE_SIZE = 60;
const STOCK_FILTERS: Array<{ id: PriceListStockFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in", label: "In stock" },
  { id: "out", label: "Out of stock" }
];
const CUSTOMER_VIEW_SWATCHES = [
  { background: "#7c2d12", color: "#fff7ed" },
  { background: "#0f766e", color: "#f0fdfa" },
  { background: "#1f1712", color: "#f6ede2" },
  { background: "#fff4dc", color: "#1f1a14" },
  { background: "#134e4a", color: "#ecfdf5" }
];

function stockTone(item: Item) {
  if (item.outOfStock) return "out";
  if (item.stockQty !== null && item.stockQty <= 2) return "low";
  return "in";
}

export function AdminPriceListPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [stock, setStock] = useState<PriceListStockFilter>("all");
  const [sort, setSort] = useState<PriceListSort>("relevance");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<HTMLInputElement>(null);
  const sync = useMutationAction();
  const imageUpload = useMutationAction();

  const priceList = useRows<PriceList>(async () => {
    const result = await getPriceList();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);

  const source = priceList.data[0];
  const categoryImages = source?.categoryImages ?? {};
  const allItems = useMemo(() => indexPriceList(source?.items ?? []), [source]);
  const showCost = allItems.some((item) => item.cost_price !== undefined);

  const categories = useMemo(() => countBy(allItems, (item) => item.displayCategory), [allItems]);
  const brands = useMemo(
    () => countBy(allItems.filter((item) => !category || item.displayCategory === category), (item) => item.brand),
    [allItems, category]
  );
  const results = useMemo(
    () => filterPriceList(allItems, { query: deferredQuery, category, brand, stock, sort }),
    [allItems, deferredQuery, category, brand, stock, sort]
  );
  const visible = results.slice(0, visibleCount);
  const filtersActive = Boolean(query.trim() || category || brand || stock !== "all");

  // Start from the top of the list whenever the filters change.
  useEffect(() => setVisibleCount(PAGE_SIZE), [deferredQuery, category, brand, stock, sort]);

  // "/" jumps to search, like most catalogue sites.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function chooseCategory(next: string | null) {
    setCategory(next);
    setBrand(null);
  }

  function clearFilters() {
    setQuery("");
    setCategory(null);
    setBrand(null);
    setStock("all");
    setSort("relevance");
  }

  async function handleSync() {
    await sync.run(() => syncPriceList(), "Price list updated from the latest Tally export.");
  }

  async function handleCategoryImage(name: string, file: File | undefined) {
    if (!file) return;
    await imageUpload.run(async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("productSku", `price-list-${name}`);
      const response = await fetch("/api/admin/upload-product-image", { method: "POST", body: formData });
      const uploaded = (await response.json()) as { error?: string; url?: string };
      if (!response.ok || !uploaded.url) {
        return { error: { message: uploaded.error ?? "Image upload failed." } };
      }
      return savePriceListCategoryImage(name, uploaded.url);
    }, `Image saved for ${name}.`);
  }

  const closeView = useCallback(() => setSelectedIndex(null), []);

  return (
    <div className="page-stack pl-page">
      <section className="pl-hero">
        <div className="pl-hero-top">
          <div>
            <h2>Price list</h2>
            <p>
              {allItems.length.toLocaleString("en-IN")} items from Tally
              {source?.syncedAt
                ? ` · updated ${new Date(source.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
                : " · not updated yet"}
            </p>
          </div>
          <button
            type="button"
            className="secondary-button pl-sync"
            disabled={sync.isSubmitting || source?.configured === false}
            onClick={() => void handleSync()}
          >
            {sync.isSubmitting ? "Updating…" : "↻ Update from Tally"}
          </button>
        </div>

        <div className="pl-search">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="pl-search-icon">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items or brands, e.g. 12w panel havells"
            aria-label="Search the price list"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button type="button" className="pl-search-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search">
              ×
            </button>
          ) : (
            <kbd className="pl-search-hint" aria-hidden="true">/</kbd>
          )}
        </div>
        {source?.configured === false ? (
          <p className="form-field-hint">The price list source is not set up yet. Please contact support.</p>
        ) : null}
        <FormNotice error={sync.error} success={sync.success} />
      </section>

      <QueryState
        loading={priceList.loading}
        error={priceList.error}
        hasData={allItems.length > 0}
        empty={{ title: "No price list yet", description: "Select Update from Tally to load the latest prices and stock." }}
      >
        <div className="pl-chips" role="tablist" aria-label="Categories">
          <button type="button" role="tab" aria-selected={!category} className={`pl-chip${!category ? " is-active" : ""}`} onClick={() => chooseCategory(null)}>
            All <span>{allItems.length.toLocaleString("en-IN")}</span>
          </button>
          {categories.map(([name, count]) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={category === name}
              className={`pl-chip${category === name ? " is-active" : ""}`}
              onClick={() => chooseCategory(category === name ? null : name)}
            >
              {name} <span>{count.toLocaleString("en-IN")}</span>
            </button>
          ))}
        </div>

        <div className="pl-toolbar">
          <label className="pl-select">
            <span>Brand</span>
            <select value={brand ?? ""} onChange={(event) => setBrand(event.target.value || null)}>
              <option value="">All brands</option>
              {brands.map(([name, count]) => (
                <option key={name} value={name}>
                  {name} ({count})
                </option>
              ))}
            </select>
          </label>
          <div className="pl-segment" role="radiogroup" aria-label="Stock">
            {STOCK_FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={stock === option.id}
                className={stock === option.id ? "is-active" : ""}
                onClick={() => setStock(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="pl-select">
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as PriceListSort)}>
              {(Object.keys(PRICE_LIST_SORT_LABELS) as PriceListSort[]).map((key) => (
                <option key={key} value={key}>
                  {PRICE_LIST_SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="pl-summary">
          <span>
            <strong>{results.length.toLocaleString("en-IN")}</strong> {results.length === 1 ? "item" : "items"}
            {category ? ` in ${category}` : ""}
            {brand ? ` · ${brand}` : ""}
          </span>
          {filtersActive ? (
            <button type="button" className="text-link-button" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
          {category && showCost ? (
            <label className={`pl-image-upload${imageUpload.isSubmitting ? " is-disabled" : ""}`}>
              {categoryImages[category] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={getServeUrl(categoryImages[category])} alt="" />
              ) : null}
              {imageUpload.isSubmitting ? "Uploading…" : categoryImages[category] ? "Change category image" : "Add category image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                disabled={imageUpload.isSubmitting}
                onChange={(event) => {
                  void handleCategoryImage(category, event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
        <FormNotice error={imageUpload.error} success={imageUpload.success} />

        {results.length === 0 ? (
          <div className="state-card">
            <strong>No items match</strong>
            <p>Try fewer words, check the spelling, or clear the filters.</p>
            {filtersActive ? (
              <button type="button" className="secondary-button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="pl-grid">
              {visible.map((item, index) => {
                const tone = stockTone(item);
                return (
                  <button key={`${item.item_name}|${index}`} type="button" className="pl-card" onClick={() => setSelectedIndex(index)}>
                    <span className="pl-card-meta">
                      {item.brand ? <span className="pl-card-brand">{item.brand}</span> : null}
                      <span>{item.displayCategory}</span>
                    </span>
                    <span className="pl-card-name">{item.displayName}</span>
                    <span className="pl-card-bottom">
                      <span className="pl-card-price">
                        <strong>{item.final_price ? formatPriceListAmount(item.final_price) : "Price on request"}</strong>
                        {item.mrp > item.final_price ? <s>{formatPriceListAmount(item.mrp)}</s> : null}
                        {showCost && item.cost_price ? <em>Cost {formatPriceListAmount(item.cost_price)}</em> : null}
                      </span>
                      <span className={`pl-stock pl-stock--${tone}`}>
                        {tone === "out" ? "Out of stock" : item.stock_label || "In stock"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {results.length > visible.length ? (
              <button type="button" className="secondary-button pl-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                Show more ({(results.length - visible.length).toLocaleString("en-IN")} left)
              </button>
            ) : null}
          </>
        )}
      </QueryState>

      {selectedIndex !== null && visible[selectedIndex] ? (
        <CustomerPriceView
          item={visible[selectedIndex]}
          imageUrl={categoryImages[visible[selectedIndex].displayCategory] ?? categoryImages[visible[selectedIndex].category]}
          position={`${selectedIndex + 1} of ${visible.length}`}
          onPrevious={selectedIndex > 0 ? () => setSelectedIndex(selectedIndex - 1) : undefined}
          onNext={selectedIndex < visible.length - 1 ? () => setSelectedIndex(selectedIndex + 1) : undefined}
          onClose={closeView}
        />
      ) : null}
    </div>
  );
}

/**
 * Customer-facing: the salesperson turns the screen around, so no cost price and large
 * type. Rendered into <body> so it covers the whole app, including its header.
 */
function CustomerPriceView({
  item,
  imageUrl,
  position,
  onPrevious,
  onNext,
  onClose
}: {
  item: Item;
  imageUrl?: string;
  position: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const [swatch] = useState(() => CUSTOMER_VIEW_SWATCHES[Math.floor(Math.random() * CUSTOMER_VIEW_SWATCHES.length)]);
  const savings = item.mrp - item.final_price;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onPrevious?.();
      if (event.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, onPrevious, onNext]);

  return createPortal(
    <div className="price-view" role="dialog" aria-modal="true" aria-label={`Price for ${item.displayName}`} style={swatch}>
      <div className="price-view-bar">
        <button type="button" className="price-view-button" onClick={onClose} autoFocus>
          ← Back to list
        </button>
        <span className="price-view-position">{position}</span>
      </div>
      <div className="price-view-body">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="price-view-image" src={getServeUrl(imageUrl)} alt={item.displayCategory} />
        ) : null}
        <p className="price-view-meta">{[item.brand, item.displayCategory].filter(Boolean).join(" · ")}</p>
        <h2>{item.displayName}</h2>
        {savings > 0 ? (
          <p className="price-view-mrp">
            MRP <s>{formatPriceListAmount(item.mrp)}</s>
          </p>
        ) : null}
        <p className="price-view-price">{item.final_price ? formatPriceListAmount(item.final_price) : "Price on request"}</p>
        {savings > 0 ? <p className="price-view-savings">You save {formatPriceListAmount(savings)}</p> : null}
        <p className="price-view-stock">{item.outOfStock ? "Currently out of stock" : "In stock"}</p>
      </div>
      <div className="price-view-nav">
        <button type="button" className="price-view-button" onClick={onPrevious} disabled={!onPrevious} aria-label="Previous item">
          ‹ Previous
        </button>
        <button type="button" className="price-view-button" onClick={onNext} disabled={!onNext} aria-label="Next item">
          Next ›
        </button>
      </div>
    </div>,
    document.body
  );
}
