"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useRef, useState, type FormEvent } from "react";
import { FormNotice, QueryState, useMutationAction, useRows } from "@/components/data-view";
import { useAuth } from "@/components/providers/auth-provider";
import { getPriceList } from "@/lib/backend/modules/inventory-gateway";
import {
  acceptQuotation,
  closeQuotation,
  createQuotation,
  getPriceCatalog,
  listQuotations,
  sendQuote,
  uploadQuotationPhoto
} from "@/lib/backend/modules/shop-gateway";
import { formatPriceListAmount, type PriceList } from "@mahalaxmi/core/gateway/inventory-gateway";
import { filterPriceList, indexPriceList } from "@mahalaxmi/core/gateway/price-list-taxonomy";
import {
  MAX_QUOTATION_PHOTOS,
  QUOTATION_STATUS_LABELS,
  filterCatalog,
  indexCatalog,
  type Quotation,
  type QuotationList,
  type QuotationStatus,
  type QuoteLineInput
} from "@mahalaxmi/core/gateway/shop-gateway";
import { useCart, useCatalog } from "@mahalaxmi/core/hooks/shop-store";

type PickedItem = { key: string; name: string; category: string; brand: string | null; quantity: number };

function formatWhen(value: string) {
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

/** Phone photos are often 5-10 MB; shrink them to a sharp 1600px JPEG before uploading. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    // The browser cannot read this format (e.g. HEIC on some browsers): send it as it is.
    return file;
  }
}

function useQuotations() {
  return useRows<QuotationList>(async () => {
    const result = await listQuotations();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);
}

function StatusBadge({ quotation }: { quotation: Quotation }) {
  const tone: Record<QuotationStatus, string> = {
    requested: "submitted",
    quoted: "confirmed",
    accepted: "delivered",
    declined: "cancelled",
    cancelled: "cancelled"
  };
  return (
    <span className={`order-status order-status--${quotation.expired ? "cancelled" : tone[quotation.status]}`}>
      {quotation.expired ? "Expired" : QUOTATION_STATUS_LABELS[quotation.status]}
    </span>
  );
}

function PhotoStrip({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="quote-photos">
      {urls.map((url, index) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" aria-label={`Open photo ${index + 1}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Requirement photo ${index + 1}`} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

function QuotationLines({ quotation }: { quotation: Quotation }) {
  const priced = quotation.total !== undefined;
  return (
    <>
      {quotation.items.length ? (
        <ul className="order-items">
          {quotation.items.map((item, index) => (
            <li key={`${item.key}-${index}`}>
              <span>
                {item.name}
                {item.brand ? <em> · {item.brand}</em> : null}
              </span>
              <span className="order-qty">
                × {item.quantity.toLocaleString("en-IN")}
                {priced && item.unit_price !== undefined ? <em> @ {formatPriceListAmount(item.unit_price)}</em> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {priced ? (
        <div className="quote-totals">
          <span>Subtotal</span>
          <span>{formatPriceListAmount(quotation.subtotal ?? 0)}</span>
          {quotation.discount_amount ? (
            <>
              <span>Discount</span>
              <span>− {formatPriceListAmount(quotation.discount_amount)}</span>
            </>
          ) : null}
          <strong>Total</strong>
          <strong>{formatPriceListAmount(quotation.total ?? 0)}</strong>
        </div>
      ) : null}
    </>
  );
}

/** Catalogue search (no prices) to add items to a quotation request. */
function ItemPicker({ picked, onChange }: { picked: PickedItem[]; onChange: (next: PickedItem[]) => void }) {
  const catalog = useCatalog(getPriceCatalog);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const items = useMemo(() => indexCatalog(catalog.data?.items ?? []), [catalog.data]);
  const matches = useMemo(
    () => (deferred.trim() ? filterCatalog(items, { query: deferred, category: null, brand: null, inStockOnly: false }).slice(0, 8) : []),
    [items, deferred]
  );

  function setQuantity(key: string, quantity: number) {
    onChange(quantity > 0 ? picked.map((item) => (item.key === key ? { ...item, quantity } : item)) : picked.filter((item) => item.key !== key));
  }

  return (
    <div className="quote-picker">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search wires, switches, MCBs, fans, lights…" aria-label="Search products to add" />
      {matches.length ? (
        <ul className="quote-matches">
          {matches.map((item) => {
            const already = picked.some((line) => line.key === item.key);
            return (
              <li key={item.key}>
                <span>
                  {item.name}
                  <em> · {[item.brand, item.category].filter(Boolean).join(" · ")}</em>
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={already}
                  onClick={() => {
                    onChange([...picked, { key: item.key, name: item.name, category: item.category, brand: item.brand, quantity: 1 }]);
                    setQuery("");
                  }}
                >
                  {already ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {picked.length ? (
        <ul className="shop-lines">
          {picked.map((line) => (
            <li key={line.key}>
              <span className="shop-line-text">
                <strong>{line.name}</strong>
                <span>{[line.brand, line.category].filter(Boolean).join(" · ")}</span>
              </span>
              <input
                className="quote-qty"
                inputMode="numeric"
                value={line.quantity}
                onChange={(event) => setQuantity(line.key, Number(event.target.value.replace(/\D/g, "")) || 0)}
                aria-label={`Quantity of ${line.name}`}
              />
              <button type="button" className="text-link-button" onClick={() => setQuantity(line.key, 0)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Ask for a quotation (items and/or photos of a requirement list) and act on the ones the shop sends. */
export function QuotationsPage({ shopHref, ordersHref }: { shopHref: string; ordersHref: string }) {
  const { profile } = useAuth();
  const quotations = useQuotations();
  const cart = useCart();
  const submit = useMutationAction();
  const action = useMutationAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [photos, setPhotos] = useState<Array<{ key: string; preview: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [phone, setPhone] = useState(profile?.phone?.replace(/^\+91/, "") ?? "");
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const list = quotations.data[0]?.quotations ?? [];

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, MAX_QUOTATION_PHOTOS - photos.length)) {
        const blob = await shrinkPhoto(file);
        const form = new FormData();
        form.append("file", blob, blob === file ? file.name : file.name.replace(/\.\w+$/, "") + ".jpg");
        const result = await uploadQuotationPhoto(form);
        if (result.error || !result.data) {
          setUploadError(result.error ?? "The photo could not be uploaded.");
          break;
        }
        setPhotos((current) => [...current, { key: result.data!.key, preview: URL.createObjectURL(blob) }]);
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await submit.run(
      () =>
        createQuotation({
          items: picked.map((item) => ({ key: item.key, quantity: item.quantity })),
          photo_keys: photos.map((photo) => photo.key),
          note: note.trim() || undefined,
          contact_phone: phone.trim() || undefined
        }),
      "Quotation request sent. The shop will send you prices soon."
    );
    if (ok) {
      setPicked([]);
      setPhotos([]);
      setNote("");
      quotations.refetch?.();
    }
  }

  const canSubmit = picked.length > 0 || photos.length > 0 || note.trim().length > 0;

  return (
    <div className="page-stack">
      <section className="shop-hero">
        <div className="shop-hero-top">
          <div>
            <h2>Quotations</h2>
            <p>Send your list — pick products, or just upload a photo of your handwritten list — and the shop sends you a priced quotation for every item: wires, switches, MCBs, fans, lights and more.</p>
          </div>
        </div>
      </section>

      <form className="order-card quote-form" onSubmit={(event) => void handleSubmit(event)}>
        <h3>Ask for a quotation</h3>

        <div className="shop-field">
          Photos of your requirement list
          <div className="quote-photos">
            {photos.map((photo) => (
              <span key={photo.key} className="quote-photo-edit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt="Requirement list photo" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((item) => item.key !== photo.key))}>
                  ×
                </button>
              </span>
            ))}
            {photos.length < MAX_QUOTATION_PHOTOS ? (
              <button type="button" className="quote-photo-add" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? "Uploading…" : "+ Add photo"}
              </button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              void addPhotos(event.target.files);
              event.target.value = "";
            }}
          />
          {uploadError ? <span className="form-field-hint" style={{ color: "var(--error)" }}>{uploadError}</span> : null}
        </div>

        <div className="shop-field">
          Products
          {cart.count > 0 && !picked.length ? (
            <button
              type="button"
              className="text-link-button quote-from-cart"
              onClick={() => setPicked(cart.lines.map((line) => ({ key: line.key, name: line.name, category: line.category, brand: line.brand, quantity: line.quantity })))}
            >
              Add the {cart.count} item{cart.count === 1 ? "" : "s"} in your cart
            </button>
          ) : null}
          <ItemPicker picked={picked} onChange={setPicked} />
        </div>

        <label className="shop-field">
          Note for the shop (optional)
          <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. 3BHK full wiring, Havells preferred, need by next week" />
        </label>
        <label className="shop-field">
          Contact number
          <input inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="10-digit mobile number" />
        </label>
        <FormNotice error={submit.error} success={submit.success} />
        <button type="submit" className="primary-button shop-submit" disabled={!canSubmit || submit.isSubmitting || uploading}>
          {submit.isSubmitting ? "Sending…" : "Request quotation"}
        </button>
        <p className="shop-muted">
          Or add products from the <Link href={shopHref}>shop</Link> to your cart and tap “Ask for a quotation”.
        </p>
      </form>

      <h3 className="shop-title" style={{ fontSize: "1.25rem" }}>My quotations</h3>
      <FormNotice error={action.error} success={action.success} />
      <QueryState loading={quotations.loading} error={quotations.error} hasData={list.length > 0} empty={{ title: "No quotations yet", description: "Your quotation requests and the prices the shop sends appear here." }}>
        <div className="order-list">
          {list.map((quotation) => (
            <article key={quotation.id} className="order-card">
              <header>
                <div>
                  <strong>{quotation.quotation_number}</strong>
                  <span className="shop-muted"> · {formatWhen(quotation.created_at)}</span>
                </div>
                <StatusBadge quotation={quotation} />
              </header>
              <PhotoStrip urls={quotation.photo_urls} />
              {quotation.note ? <p className="order-note">You wrote: {quotation.note}</p> : null}
              {quotation.status === "requested" ? (
                <p className="shop-muted">The shop is preparing prices for this request. You will get a notification when it is ready.</p>
              ) : null}
              <QuotationLines quotation={quotation} />
              {quotation.admin_note ? <p className="order-note">Shop: {quotation.admin_note}</p> : null}
              {quotation.status === "quoted" && quotation.valid_until ? (
                <p className="shop-muted">{quotation.expired ? "Expired on" : "Valid until"} {formatDate(quotation.valid_until)}</p>
              ) : null}

              {quotation.status === "quoted" && !quotation.expired ? (
                <div className="order-actions">
                  <input
                    className="order-note-input"
                    value={addresses[quotation.id] ?? ""}
                    onChange={(event) => setAddresses({ ...addresses, [quotation.id]: event.target.value })}
                    placeholder="Delivery address"
                    aria-label="Delivery address"
                  />
                  <button
                    type="button"
                    className="primary-button"
                    disabled={action.isSubmitting || (addresses[quotation.id] ?? "").trim().length < 5}
                    onClick={() =>
                      void action.run(
                        () => acceptQuotation(quotation.id, { delivery_address: addresses[quotation.id]!.trim(), contact_phone: phone.trim() || undefined }),
                        `${quotation.quotation_number} accepted. Your order has been placed.`
                      )
                    }
                  >
                    Accept & order
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={action.isSubmitting}
                    onClick={() => window.confirm(`Decline ${quotation.quotation_number}?`) && void action.run(() => closeQuotation(quotation.id), "Quotation declined.")}
                  >
                    Decline
                  </button>
                </div>
              ) : null}
              {quotation.status === "requested" ? (
                <button
                  type="button"
                  className="text-link-button"
                  disabled={action.isSubmitting}
                  onClick={() => window.confirm(`Withdraw ${quotation.quotation_number}?`) && void action.run(() => closeQuotation(quotation.id), "Request withdrawn.")}
                >
                  Withdraw request
                </button>
              ) : null}
              {quotation.status === "accepted" ? (
                <Link className="text-link-button" href={ordersHref}>
                  Track the order →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </QueryState>
    </div>
  );
}

const ADMIN_FILTERS: Array<{ id: string; label: string; statuses: QuotationStatus[] }> = [
  { id: "new", label: "New requests", statuses: ["requested"] },
  { id: "sent", label: "Sent", statuses: ["quoted"] },
  { id: "accepted", label: "Accepted", statuses: ["accepted"] },
  { id: "closed", label: "Closed", statuses: ["declined", "cancelled"] }
];

type EditableLine = { id: string; key?: string; name: string; category?: string; brand?: string | null; quantity: string; unit_price: string };

let lineCounter = 0;
const newLineId = () => `line-${++lineCounter}`;

/** Prices a request: lines start from today's Tally prices and can be edited, added or removed. */
function QuoteEditor({ quotation, priceList, onDone }: { quotation: Quotation; priceList: PriceList | undefined; onDone: () => void }) {
  const save = useMutationAction();
  const [lines, setLines] = useState<EditableLine[]>(() =>
    quotation.items.map((item) => ({
      id: newLineId(),
      key: item.key || undefined,
      name: item.name,
      category: item.category,
      brand: item.brand,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price ?? 0)
    }))
  );
  const [discount, setDiscount] = useState(String(quotation.discount_amount ?? 0));
  const [validDays, setValidDays] = useState("7");
  const [note, setNote] = useState(quotation.admin_note ?? "");
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const indexed = useMemo(() => indexPriceList(priceList?.items ?? []), [priceList]);
  const matches = useMemo(
    () => (deferred.trim() ? filterPriceList(indexed, { query: deferred, category: null, brand: null, stock: "all", sort: "relevance" }).slice(0, 8) : []),
    [indexed, deferred]
  );

  const subtotal = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0), 0);
  const total = subtotal - (Number(discount) || 0);
  const update = (id: string, change: Partial<EditableLine>) => setLines(lines.map((line) => (line.id === id ? { ...line, ...change } : line)));

  async function send() {
    const items: QuoteLineInput[] = lines.map((line) => ({
      key: line.key,
      name: line.name.trim(),
      category: line.category,
      brand: line.brand ?? null,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price)
    }));
    const ok = await save.run(
      () => sendQuote(quotation.id, { items, discount_amount: Number(discount) || 0, admin_note: note.trim() || undefined, valid_days: Number(validDays) || 7 }),
      `${quotation.quotation_number} sent to the customer.`
    );
    if (ok) onDone();
  }

  return (
    <div className="quote-editor">
      <div className="quote-picker">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add from the price list: search item or brand" aria-label="Search the price list" />
        {matches.length ? (
          <ul className="quote-matches">
            {matches.map((item) => (
              <li key={item.item_name}>
                <span>
                  {item.displayName}
                  <em> · {formatPriceListAmount(item.final_price)}{item.outOfStock ? " · out of stock" : ""}</em>
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setLines([
                      ...lines,
                      {
                        id: newLineId(),
                        key: item.key,
                        name: item.displayName,
                        category: item.displayCategory,
                        brand: item.brand,
                        quantity: "1",
                        unit_price: String(item.final_price)
                      }
                    ]);
                    setQuery("");
                  }}
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <table className="quote-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Rate ₹</th>
            <th>Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>
                <input value={line.name} onChange={(event) => update(line.id, { name: event.target.value })} aria-label="Item name" />
              </td>
              <td>
                <input className="quote-qty" inputMode="decimal" value={line.quantity} onChange={(event) => update(line.id, { quantity: event.target.value })} aria-label="Quantity" />
              </td>
              <td>
                <input className="quote-rate" inputMode="decimal" value={line.unit_price} onChange={(event) => update(line.id, { unit_price: event.target.value })} aria-label="Rate" />
              </td>
              <td className="quote-amount">{formatPriceListAmount((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}</td>
              <td>
                <button type="button" className="text-link-button" onClick={() => setLines(lines.filter((item) => item.id !== line.id))} aria-label={`Remove ${line.name}`}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="text-link-button"
        onClick={() => setLines([...lines, { id: newLineId(), name: "", quantity: "1", unit_price: "0" }])}
      >
        + Add a line not in the price list
      </button>

      <div className="quote-settings">
        <label className="shop-field">
          Discount ₹
          <input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} />
        </label>
        <label className="shop-field">
          Valid for (days)
          <input inputMode="numeric" value={validDays} onChange={(event) => setValidDays(event.target.value)} />
        </label>
      </div>
      <label className="shop-field">
        Note for the customer (optional)
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Includes delivery. Polycab wire on offer this week." />
      </label>
      <div className="quote-totals">
        <span>Subtotal</span>
        <span>{formatPriceListAmount(subtotal)}</span>
        <span>Discount</span>
        <span>− {formatPriceListAmount(Number(discount) || 0)}</span>
        <strong>Total</strong>
        <strong>{formatPriceListAmount(total)}</strong>
      </div>
      <FormNotice error={save.error} success={null} />
      <button type="button" className="primary-button" disabled={save.isSubmitting || !lines.length} onClick={() => void send()}>
        {save.isSubmitting ? "Sending…" : quotation.status === "quoted" ? "Send updated quotation" : "Send quotation"}
      </button>
    </div>
  );
}

/** Every quotation request, for the shop to price and send. */
export function AdminQuotationsPage() {
  const quotations = useQuotations();
  const action = useMutationAction();
  const [filter, setFilter] = useState("new");
  const [editing, setEditing] = useState<string | null>(null);
  const priceList = useRows<PriceList>(async () => {
    const result = await getPriceList();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);
  const all = quotations.data[0]?.quotations ?? [];
  const statuses = ADMIN_FILTERS.find((option) => option.id === filter)?.statuses ?? [];
  const list = all.filter((quotation) => statuses.includes(quotation.status));

  return (
    <div className="page-stack">
      <div>
        <h2 className="shop-title">Quotations</h2>
        <p className="shop-muted">Requests from customers, electricians and architects. Lines start at today&apos;s Tally prices; change any rate, add items or a discount, then send.</p>
      </div>
      <div className="pl-segment" role="radiogroup" aria-label="Quotation status">
        {ADMIN_FILTERS.map((option) => {
          const count = all.filter((quotation) => option.statuses.includes(quotation.status)).length;
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
        loading={quotations.loading}
        error={quotations.error}
        hasData={list.length > 0}
        empty={{ title: "Nothing here", description: filter === "new" ? "New quotation requests appear here, and you get a notification for each." : "No quotations with this status." }}
      >
        <div className="order-list">
          {list.map((quotation) => (
            <article key={quotation.id} className="order-card">
              <header>
                <div>
                  <strong>{quotation.quotation_number}</strong>
                  <span className="shop-muted"> · {formatWhen(quotation.created_at)}</span>
                </div>
                <StatusBadge quotation={quotation} />
              </header>
              <div className="order-customer">
                <strong>{quotation.customer?.full_name ?? "Customer"}</strong>
                {quotation.customer?.role && quotation.customer.role !== "customer" ? <span className="order-role">{quotation.customer.role}</span> : null}
                {quotation.contact_phone || quotation.customer?.phone ? (
                  <a href={`tel:${quotation.contact_phone || quotation.customer?.phone}`}>{quotation.contact_phone || quotation.customer?.phone}</a>
                ) : null}
                {quotation.note ? <span className="order-note">Note: {quotation.note}</span> : null}
              </div>
              <PhotoStrip urls={quotation.photo_urls} />
              {editing === quotation.id ? (
                <QuoteEditor
                  quotation={quotation}
                  priceList={priceList.data[0]}
                  onDone={() => {
                    setEditing(null);
                    quotations.refetch?.();
                  }}
                />
              ) : (
                <>
                  <QuotationLines quotation={quotation} />
                  {quotation.admin_note ? <p className="order-note">Your note: {quotation.admin_note}</p> : null}
                  {quotation.valid_until && quotation.status === "quoted" ? <p className="shop-muted">Valid until {formatDate(quotation.valid_until)}</p> : null}
                  {quotation.status === "requested" || quotation.status === "quoted" ? (
                    <div className="order-actions">
                      <button type="button" className="primary-button" onClick={() => setEditing(quotation.id)}>
                        {quotation.status === "requested" ? "Prepare quotation" : "Edit & resend"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={action.isSubmitting}
                        onClick={() => {
                          const reason = window.prompt(`Close ${quotation.quotation_number}? Optional note for the customer:`);
                          if (reason !== null) void action.run(() => closeQuotation(quotation.id, reason.trim() || undefined), `${quotation.quotation_number} closed.`);
                        }}
                      >
                        Close request
                      </button>
                    </div>
                  ) : null}
                </>
              )}
              {editing === quotation.id ? (
                <button type="button" className="text-link-button" onClick={() => setEditing(null)}>
                  Cancel editing
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
