"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { FormNotice, QueryState, useMutationAction, useRows } from "@/components/data-view";
import { SkeletonCards } from "@/components/skeleton";
import { useAuth } from "@/components/providers/auth-provider";
import { getServeUrl } from "@/lib/s3";
import { createOrderRequest, createQuotation, getPriceCatalog, listOrderRequests, updateOrderRequestStatus } from "@/lib/backend/modules/shop-gateway";
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

const PAGE_SIZE = 48;
const TILE_TONES = ["#7c2d12", "#0f766e", "#1e3a8a", "#6d28d9", "#9a3412", "#065f46", "#334155", "#a16207"];

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

function CategoryArt({ name, imageUrl, className }: { name: string; imageUrl?: string; className: string }) {
  return imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={getServeUrl(imageUrl)} alt="" loading="lazy" />
  ) : (
    <span className={`${className} shop-art-fallback`} style={{ background: toneFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function QuantityStepper({ value, onChange, label }: { value: number; onChange: (next: number) => void; label: string }) {
  return (
    <span className="shop-stepper" role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label="One less">
        −
      </button>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(Number(event.target.value.replace(/\D/g, "")) || 0)}
        aria-label="Quantity"
      />
      <button type="button" onClick={() => onChange(value + 1)} aria-label="One more">
        +
      </button>
    </span>
  );
}

/** Order from the Tally price list: categories with pictures, availability, no prices. */
export function ShopPage({ ordersHref, quotationsHref }: { ordersHref: string; quotationsHref: string }) {
  const catalog = useCatalog(getPriceCatalog);
  const cart = useCart();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [cartOpen, setCartOpen] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef<HTMLInputElement>(null);

  const images = catalog.data?.categoryImages ?? {};
  const items = useMemo(() => indexCatalog(catalog.data?.items ?? []), [catalog.data]);
  const categories = useMemo(() => countBy(items, (item) => item.category), [items]);
  const brands = useMemo(() => countBy(items.filter((item) => !category || item.category === category), (item) => item.brand), [items, category]);
  const browsing = Boolean(deferredQuery.trim() || category);
  const results = useMemo(
    () => (browsing ? filterCatalog(items, { query: deferredQuery, category, brand, inStockOnly }) : []),
    [browsing, items, deferredQuery, category, brand, inStockOnly]
  );
  const visible = results.slice(0, visibleCount);

  useEffect(() => setVisibleCount(PAGE_SIZE), [deferredQuery, category, brand, inStockOnly]);

  function chooseCategory(next: string | null) {
    setCategory(next);
    setBrand(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="page-stack shop-page">
      <section className="shop-hero">
        <div className="shop-hero-top">
          <div>
            <h2>{category ?? "Shop products"}</h2>
            <p>
              {category
                ? `${results.length.toLocaleString("en-IN")} items`
                : "Live stock from our store. Add what you need and send your order — we confirm the price when billing."}
            </p>
          </div>
          <Link className="secondary-button" href={ordersHref}>
            My orders
          </Link>
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
            placeholder="Search products or brands, e.g. 6A switch anchor"
            aria-label="Search products"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button type="button" className="pl-search-clear" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search">
              ×
            </button>
          ) : null}
        </div>
        {category ? (
          <button type="button" className="shop-back" onClick={() => chooseCategory(null)}>
            ← All categories
          </button>
        ) : null}
      </section>

      {catalog.loading ? (
        <SkeletonCards />
      ) : catalog.error && !catalog.data ? (
        <div className="state-card state-card--error">
          {catalog.error}
          <button type="button" className="secondary-button" onClick={() => void catalog.refresh()}>
            Try again
          </button>
        </div>
      ) : !items.length ? (
        <div className="state-card">
          <strong>The catalogue is being prepared</strong>
          <p>Please check back shortly.</p>
        </div>
      ) : !browsing ? (
        <div className="shop-categories">
          {categories.map(([name, count]) => (
            <button key={name} type="button" className="shop-category" onClick={() => chooseCategory(name)}>
              <CategoryArt name={name} imageUrl={images[name]} className="shop-category-art" />
              <span className="shop-category-label">
                <strong>{name}</strong>
                <span>{count.toLocaleString("en-IN")} items</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="pl-toolbar">
            {brands.length > 1 ? (
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
            ) : null}
            <label className="shop-toggle">
              <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />
              In stock only
            </label>
            {!category ? (
              <span className="shop-muted">
                {results.length.toLocaleString("en-IN")} {results.length === 1 ? "match" : "matches"}
              </span>
            ) : null}
          </div>

          {results.length === 0 ? (
            <div className="state-card">
              <strong>No products match</strong>
              <p>Try fewer words or check the spelling.</p>
            </div>
          ) : (
            <>
              <div className="shop-grid">
                {visible.map((item) => (
                  <ShopItemCard key={item.key} item={item} imageUrl={images[item.category]} quantity={cart.quantityOf(item.key)} onQuantity={(next) => cart.setQuantity(item, next)} />
                ))}
              </div>
              {results.length > visible.length ? (
                <button type="button" className="secondary-button pl-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
                  Show more ({(results.length - visible.length).toLocaleString("en-IN")} left)
                </button>
              ) : null}
            </>
          )}
        </>
      )}

      {cart.count > 0 ? (
        <button type="button" className="shop-cart-bar" onClick={() => setCartOpen(true)}>
          <span>
            <strong>{cart.count}</strong> {cart.count === 1 ? "item" : "items"} · {cart.totalQuantity.toLocaleString("en-IN")} pcs
          </span>
          <span>View cart →</span>
        </button>
      ) : null}

      {cartOpen ? <CartSheet ordersHref={ordersHref} quotationsHref={quotationsHref} onClose={() => setCartOpen(false)} /> : null}
    </div>
  );
}

function ShopItemCard({
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
    <article className={`shop-item${item.inStock ? "" : " is-out"}`}>
      <CategoryArt name={item.category} imageUrl={imageUrl} className="shop-item-art" />
      <div className="shop-item-body">
        <span className="pl-card-meta">
          {item.brand ? <span className="pl-card-brand">{item.brand}</span> : null}
          <span>{item.category}</span>
        </span>
        <span className="shop-item-name">{item.name}</span>
        <span className="shop-item-bottom">
          <span className={`pl-stock pl-stock--${item.inStock ? "in" : "out"}`}>{item.inStock ? "In stock" : "Out of stock"}</span>
          {!item.inStock ? null : quantity > 0 ? (
            <QuantityStepper value={quantity} onChange={onQuantity} label={item.name} />
          ) : (
            <button type="button" className="primary-button shop-add" onClick={() => onQuantity(1)}>
              Add
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

function CartSheet({ ordersHref, quotationsHref, onClose }: { ordersHref: string; quotationsHref: string; onClose: () => void }) {
  const { profile } = useAuth();
  const cart = useCart();
  const submit = useMutationAction();
  const [form, setForm] = useState(() => ({
    delivery_address: profile?.city ? `${profile.city}` : "",
    contact_phone: profile?.phone?.replace(/^\+91/, "") ?? "",
    note: ""
  }));
  const [placed, setPlaced] = useState<{ kind: "order" | "quotation"; number: string } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    let orderNumber = "";
    const ok = await submit.run(async () => {
      const result = await createOrderRequest({
        items: cart.lines.map((line) => ({ key: line.key, quantity: line.quantity })),
        delivery_address: form.delivery_address,
        contact_phone: form.contact_phone || undefined,
        note: form.note || undefined
      });
      orderNumber = result.data?.order_number ?? "";
      return { error: result.error };
    });
    if (ok) {
      cart.clear();
      setPlaced({ kind: "order", number: orderNumber });
    }
  }

  // Same cart, but the shop sends prices first instead of taking the order straight away.
  async function askForQuotation() {
    let quotationNumber = "";
    const ok = await submit.run(async () => {
      const result = await createQuotation({
        items: cart.lines.map((line) => ({ key: line.key, quantity: line.quantity })),
        photo_keys: [],
        note: form.note || undefined,
        contact_phone: form.contact_phone || undefined
      });
      quotationNumber = result.data?.quotation_number ?? "";
      return { error: result.error };
    });
    if (ok) {
      cart.clear();
      setPlaced({ kind: "quotation", number: quotationNumber });
    }
  }

  return createPortal(
    <div className="shop-sheet-backdrop" onClick={onClose}>
      <aside className="shop-sheet" role="dialog" aria-modal="true" aria-label="Your cart" onClick={(event) => event.stopPropagation()}>
        <div className="shop-sheet-head">
          <h3>{placed ? (placed.kind === "order" ? "Order sent" : "Quotation requested") : "Your cart"}</h3>
          <button type="button" className="pl-search-clear shop-sheet-close" onClick={onClose} aria-label="Close" autoFocus>
            ×
          </button>
        </div>

        {placed ? (
          <div className="shop-placed">
            <span className="shop-placed-tick" aria-hidden="true">✓</span>
            <strong>
              {placed.kind === "order" ? "Order" : "Quotation request"} {placed.number} received
            </strong>
            <p>
              {placed.kind === "order"
                ? "We will check stock and confirm your order shortly. You will get a notification at each step."
                : "The shop will send you prices for these items. You will get a notification when your quotation is ready."}
            </p>
            <Link className="primary-button" href={placed.kind === "order" ? ordersHref : quotationsHref} onClick={onClose}>
              {placed.kind === "order" ? "Track my orders" : "View my quotations"}
            </Link>
            <button type="button" className="secondary-button" onClick={onClose}>
              Continue shopping
            </button>
          </div>
        ) : cart.count === 0 ? (
          <div className="state-card">
            <strong>Your cart is empty</strong>
            <p>Add products from the catalogue.</p>
          </div>
        ) : (
          <form className="shop-sheet-body" onSubmit={(event) => void handleSubmit(event)}>
            <ul className="shop-lines">
              {cart.lines.map((line) => (
                <li key={line.key}>
                  <span className="shop-line-text">
                    <strong>{line.name}</strong>
                    <span>{[line.brand, line.category].filter(Boolean).join(" · ")}</span>
                  </span>
                  <QuantityStepper value={line.quantity} onChange={(next) => cart.setQuantity(line, next)} label={line.name} />
                  <button type="button" className="text-link-button" onClick={() => cart.remove(line.key)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <label className="shop-field">
              Delivery address
              <textarea
                required
                minLength={5}
                rows={3}
                value={form.delivery_address}
                onChange={(event) => setForm({ ...form, delivery_address: event.target.value })}
                placeholder="House / shop, street, area, city"
              />
            </label>
            <label className="shop-field">
              Contact number
              <input
                inputMode="tel"
                value={form.contact_phone}
                onChange={(event) => setForm({ ...form, contact_phone: event.target.value })}
                placeholder="10-digit mobile number"
              />
            </label>
            <label className="shop-field">
              Note for the shop (optional)
              <textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Delivery time, site name, colour…" />
            </label>
            <p className="shop-muted">Prices are confirmed by the shop at billing.</p>
            <FormNotice error={submit.error} success={null} />
            <button type="submit" className="primary-button shop-submit" disabled={submit.isSubmitting}>
              {submit.isSubmitting ? "Sending…" : `Send order (${cart.count} ${cart.count === 1 ? "item" : "items"})`}
            </button>
            <button type="button" className="secondary-button shop-submit" disabled={submit.isSubmitting} onClick={() => void askForQuotation()}>
              Ask for a quotation instead
            </button>
          </form>
        )}
      </aside>
    </div>,
    document.body
  );
}

const STATUS_STEPS: OrderRequestStatus[] = ["submitted", "confirmed", "ready", "delivered"];

function OrderProgress({ status }: { status: OrderRequestStatus }) {
  if (status === "cancelled") return <span className="order-status order-status--cancelled">Cancelled</span>;
  const reached = STATUS_STEPS.indexOf(status);
  return (
    <ol className="order-steps" aria-label={`Status: ${ORDER_STATUS_LABELS[status]}`}>
      {STATUS_STEPS.map((step, index) => (
        <li key={step} className={index <= reached ? "is-done" : ""} aria-current={index === reached ? "step" : undefined}>
          <span />
          {ORDER_STATUS_LABELS[step]}
        </li>
      ))}
    </ol>
  );
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function useOrders() {
  return useRows<OrderRequestList>(async () => {
    const result = await listOrderRequests();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);
}

/** The signed-in person's orders, newest first, with progress. Prices are never shown. */
export function MyOrdersPage({ shopHref }: { shopHref: string }) {
  const orders = useOrders();
  const cancel = useMutationAction();
  const list = orders.data[0]?.orders ?? [];

  return (
    <div className="page-stack">
      <div className="shop-hero-top">
        <div>
          <h2 className="shop-title">My orders</h2>
          <p className="shop-muted">Track what you ordered from the store.</p>
        </div>
        <Link className="primary-button" href={shopHref}>
          Shop products
        </Link>
      </div>
      <FormNotice error={cancel.error} success={cancel.success} />
      <QueryState
        loading={orders.loading}
        error={orders.error}
        hasData={list.length > 0}
        empty={{ title: "No orders yet", description: "Browse the catalogue, add items to your cart and send your order." }}
      >
        <div className="order-list">
          {list.map((order) => (
            <article key={order.id} className="order-card">
              <header>
                <div>
                  <strong>{order.order_number}</strong>
                  <span className="shop-muted"> · {formatWhen(order.created_at)}</span>
                </div>
                <span className={`order-status order-status--${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span>
              </header>
              <OrderProgress status={order.status} />
              <OrderItems order={order} showPrices={false} />
              {order.admin_note ? <p className="order-note">Shop: {order.admin_note}</p> : null}
              {order.status === "submitted" ? (
                <button
                  type="button"
                  className="text-link-button"
                  disabled={cancel.isSubmitting}
                  onClick={() => {
                    if (window.confirm(`Cancel order ${order.order_number}?`)) {
                      void cancel.run(() => updateOrderRequestStatus(order.id, "cancelled"), `Order ${order.order_number} cancelled.`);
                    }
                  }}
                >
                  Cancel order
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </QueryState>
    </div>
  );
}

function OrderItems({ order, showPrices }: { order: OrderRequest; showPrices: boolean }) {
  return (
    <ul className="order-items">
      {order.items.map((item, index) => (
        <li key={`${item.key}-${index}`}>
          <span>
            {item.name}
            {item.brand ? <em> · {item.brand}</em> : null}
          </span>
          <span className="order-qty">
            × {item.quantity.toLocaleString("en-IN")}
            {showPrices && item.unit_price ? <em> @ {formatPriceListAmount(item.unit_price)}</em> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

const ADMIN_FILTERS: Array<{ id: string; label: string; statuses: OrderRequestStatus[] }> = [
  { id: "new", label: "New", statuses: ["submitted"] },
  { id: "active", label: "In progress", statuses: ["confirmed", "ready"] },
  { id: "done", label: "Delivered", statuses: ["delivered"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled"] }
];

/** Every order sent from the catalogue, with price list estimates, for the shop to process. */
export function AdminOrderRequestsPage() {
  const orders = useOrders();
  const action = useMutationAction();
  const [filter, setFilter] = useState("new");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const all = orders.data[0]?.orders ?? [];
  const statuses = ADMIN_FILTERS.find((option) => option.id === filter)?.statuses ?? [];
  const list = all.filter((order) => statuses.includes(order.status));

  return (
    <div className="page-stack">
      <div>
        <h2 className="shop-title">Orders</h2>
        <p className="shop-muted">Orders customers, electricians and architects sent from the price list. Estimates use today&apos;s Tally prices.</p>
      </div>
      <div className="pl-segment" role="radiogroup" aria-label="Order status">
        {ADMIN_FILTERS.map((option) => {
          const count = all.filter((order) => option.statuses.includes(order.status)).length;
          return (
            <button key={option.id} type="button" role="radio" aria-checked={filter === option.id} className={filter === option.id ? "is-active" : ""} onClick={() => setFilter(option.id)}>
              {option.label}
              {count ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>
      <FormNotice error={action.error} success={action.success} />
      <QueryState
        loading={orders.loading}
        error={orders.error}
        hasData={list.length > 0}
        empty={{ title: "Nothing here", description: filter === "new" ? "New orders appear here, and you get a notification for each." : "No orders with this status." }}
      >
        <div className="order-list">
          {list.map((order) => (
            <article key={order.id} className="order-card">
              <header>
                <div>
                  <strong>{order.order_number}</strong>
                  <span className="shop-muted"> · {formatWhen(order.created_at)}</span>
                </div>
                <span className={`order-status order-status--${order.status}`}>{ORDER_STATUS_LABELS[order.status]}</span>
              </header>
              <div className="order-customer">
                <strong>{order.customer?.full_name ?? "Customer"}</strong>
                {order.customer?.role && order.customer.role !== "customer" ? <span className="order-role">{order.customer.role}</span> : null}
                {order.contact_phone || order.customer?.phone ? (
                  <a href={`tel:${order.contact_phone || order.customer?.phone}`}>{order.contact_phone || order.customer?.phone}</a>
                ) : null}
                <span>{order.delivery_address}</span>
                {order.note ? <span className="order-note">Note: {order.note}</span> : null}
                {order.partner ? (
                  <span className="order-note">
                    Brought by {order.partner.full_name} ({order.partner.role}) — earns incentives when delivered
                  </span>
                ) : null}
              </div>
              <OrderItems order={order} showPrices />
              <p className="order-total">
                {order.item_count} items · estimate <strong>{formatPriceListAmount(order.estimated_total ?? 0)}</strong>
              </p>
              {order.admin_note ? <p className="order-note">Your note: {order.admin_note}</p> : null}
              {ORDER_NEXT_STATUSES[order.status].length ? (
                <div className="order-actions">
                  <input
                    className="order-note-input"
                    value={notes[order.id] ?? ""}
                    onChange={(event) => setNotes({ ...notes, [order.id]: event.target.value })}
                    placeholder="Note for the customer (optional)"
                    aria-label="Note for the customer"
                  />
                  {ORDER_NEXT_STATUSES[order.status].map((next) => (
                    <button
                      key={next}
                      type="button"
                      className={next === "cancelled" ? "secondary-button" : "primary-button"}
                      disabled={action.isSubmitting}
                      onClick={() => {
                        if (next === "cancelled" && !window.confirm(`Cancel order ${order.order_number}?`)) return;
                        void action.run(
                          () => updateOrderRequestStatus(order.id, next, notes[order.id]?.trim() || undefined),
                          `${order.order_number}: ${ORDER_STATUS_LABELS[next]}.`
                        );
                      }}
                    >
                      {ORDER_STATUS_ACTIONS[next]}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
