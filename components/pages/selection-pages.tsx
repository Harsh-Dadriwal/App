"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FormNotice, QueryState, useMutationAction, useRows } from "@/components/data-view";
import { useAuth } from "@/components/providers/auth-provider";
import { ItemPicker, type PickedItem } from "@/components/pages/quotation-pages";
import { closeSelection, listSelections, orderSelection, quoteSelection, saveSelection } from "@/lib/backend/modules/shop-gateway";
import { formatPriceListAmount } from "@mahalaxmi/core/gateway/inventory-gateway";
import {
  ORDER_STATUS_LABELS,
  QUOTATION_STATUS_LABELS,
  SELECTION_STATUS_LABELS,
  selectionShareText,
  type ProductSelection,
  type SelectionList,
  type SelectionStatus
} from "@mahalaxmi/core/gateway/shop-gateway";

const EMPTY_FORM = { title: "", customer_name: "", customer_phone: "", site_note: "" };

function formatWhen(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function useSelections() {
  return useRows<SelectionList>(async () => {
    const result = await listSelections();
    return { data: result.data ? [result.data] : [], error: result.error };
  }, []);
}

/** WhatsApp link with the product list (no prices); straight to the customer when we know their number. */
function whatsAppLink(selection: ProductSelection, from: string) {
  const text = encodeURIComponent(selectionShareText(selection, from));
  const digits = (selection.customer_phone ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}

function SelectionItems({ selection, showPrices }: { selection: ProductSelection; showPrices: boolean }) {
  return (
    <ul className="order-items">
      {selection.items.map((item, index) => (
        <li key={`${item.key}-${index}`}>
          <span>
            {item.name}
            {item.note ? <em> · {item.note}</em> : null}
            {showPrices && item.in_stock === false ? <em> · out of stock</em> : null}
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

function LinkedActivity({ selection }: { selection: ProductSelection }) {
  if (!selection.orders.length && !selection.quotations.length) return null;
  return (
    <p className="shop-muted">
      {[
        ...selection.orders.map((order) => `Order ${order.number}: ${ORDER_STATUS_LABELS[order.status]}`),
        ...selection.quotations.map((quote) => `Quotation ${quote.number}: ${QUOTATION_STATUS_LABELS[quote.status]}`)
      ].join(" · ")}
    </p>
  );
}

/** Order or ask for prices on a selection: used by the customer it is for and by the professional who made it. */
function SelectionActions({ selection, onDone, ordersHref, quotationsHref }: { selection: ProductSelection; onDone: () => void; ordersHref: string; quotationsHref: string }) {
  const action = useMutationAction();
  const [address, setAddress] = useState("");
  const [done, setDone] = useState<"order" | "quotation" | null>(null);

  async function run(kind: "order" | "quotation") {
    const ok = await action.run(
      () => (kind === "order" ? orderSelection(selection.id, { delivery_address: address.trim() }) : quoteSelection(selection.id)),
      kind === "order" ? "Order placed. The shop will confirm it shortly." : "Quotation requested. The shop will send prices."
    );
    if (ok) {
      setDone(kind);
      onDone();
    }
  }

  if (selection.status === "closed") return null;
  return (
    <>
      <div className="order-actions">
        <input className="order-note-input" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Delivery address" aria-label="Delivery address" />
        <button type="button" className="primary-button" disabled={action.isSubmitting || address.trim().length < 5} onClick={() => void run("order")}>
          Order these
        </button>
        <button type="button" className="secondary-button" disabled={action.isSubmitting} onClick={() => void run("quotation")}>
          Get a quotation
        </button>
      </div>
      <FormNotice error={action.error} success={action.success} />
      {done ? (
        <Link className="text-link-button" href={done === "order" ? ordersHref : quotationsHref}>
          {done === "order" ? "Track the order →" : "See the quotation →"}
        </Link>
      ) : null}
    </>
  );
}

/**
 * Electricians and architects: pick products for a customer's job and share them.
 * Customers: the selections their electrician or architect made for them.
 */
export function SelectionsPage({ ordersHref, quotationsHref, incentivesHref }: { ordersHref: string; quotationsHref: string; incentivesHref?: string }) {
  const { profile } = useAuth();
  const selections = useSelections();
  const save = useMutationAction();
  const action = useMutationAction();
  const [form, setForm] = useState(EMPTY_FORM);
  const [picked, setPicked] = useState<PickedItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const role = selections.data[0]?.role;
  const list = selections.data[0]?.selections ?? [];
  const from = `${profile?.full_name ?? "your electrician"}${profile?.role ? ` (${profile.role})` : ""}`;

  function startEdit(selection: ProductSelection) {
    setEditingId(selection.id);
    setForm({
      title: selection.title,
      customer_name: selection.customer_name ?? "",
      customer_phone: (selection.customer_phone ?? "").replace(/^\+91/, ""),
      site_note: selection.site_note ?? ""
    });
    setPicked(selection.items.map((item) => ({ key: item.key, name: item.name, category: item.category, brand: item.brand, quantity: item.quantity })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPicked([]);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    let linked = false;
    const ok = await save.run(async () => {
      const result = await saveSelection(
        {
          title: form.title.trim(),
          customer_name: form.customer_name.trim() || undefined,
          customer_phone: form.customer_phone.trim() || undefined,
          site_note: form.site_note.trim() || undefined,
          items: picked.map((item) => ({ key: item.key, quantity: item.quantity }))
        },
        editingId ?? undefined
      );
      linked = Boolean(result.data?.linked_customer);
      return { error: result.error };
    });
    if (ok) {
      reset();
      selections.refetch?.();
      window.alert(
        linked
          ? "Saved. The customer has the app, so it is already in their Selections and they got a notification."
          : "Saved. The customer is not on the app with that number yet — share it on WhatsApp from the list below."
      );
    }
  }

  if (role === "customer") {
    return (
      <div className="page-stack">
        <div>
          <h2 className="shop-title">Selections</h2>
          <p className="shop-muted">Products your electrician or architect picked for your home. Order them in one tap, or ask the shop for a quotation first.</p>
        </div>
        <QueryState loading={selections.loading} error={selections.error} hasData={list.length > 0} empty={{ title: "No selections yet", description: "When your electrician or architect picks products for you using your phone number, they appear here." }}>
          <div className="order-list">
            {list.map((selection) => (
              <article key={selection.id} className="order-card">
                <header>
                  <div>
                    <strong>{selection.title}</strong>
                    <span className="shop-muted"> · {selection.selection_number} · {formatWhen(selection.created_at)}</span>
                  </div>
                  <span className={`order-status order-status--${selection.status === "ordered" ? "delivered" : "confirmed"}`}>{SELECTION_STATUS_LABELS[selection.status]}</span>
                </header>
                {selection.created_by ? (
                  <p className="order-note">
                    Selected by <strong>{selection.created_by.full_name}</strong> ({selection.created_by.role})
                    {selection.created_by.phone ? <> · <a href={`tel:${selection.created_by.phone}`}>{selection.created_by.phone}</a></> : null}
                  </p>
                ) : null}
                {selection.site_note ? <p className="order-note">Note: {selection.site_note}</p> : null}
                <SelectionItems selection={selection} showPrices={false} />
                <LinkedActivity selection={selection} />
                <SelectionActions selection={selection} onDone={() => selections.refetch?.()} ordersHref={ordersHref} quotationsHref={quotationsHref} />
              </article>
            ))}
          </div>
        </QueryState>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="shop-hero">
        <div className="shop-hero-top">
          <div>
            <h2>Product selections</h2>
            <p>
              Pick the products for a customer&apos;s job and send them over. If the customer has the app, it appears in their Selections and they can order in one tap —
              you earn incentives when that order is delivered.
            </p>
          </div>
          {incentivesHref ? (
            <Link className="secondary-button" href={incentivesHref}>
              My incentives
            </Link>
          ) : null}
        </div>
      </section>

      <form className="order-card quote-form" onSubmit={(event) => void handleSave(event)}>
        <h3>{editingId ? "Edit selection" : "New selection"}</h3>
        <label className="shop-field">
          Name
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Sharma house – switches & lights" required minLength={3} />
        </label>
        <div className="quote-settings">
          <label className="shop-field">
            Customer name
            <input value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} placeholder="Optional" />
          </label>
          <label className="shop-field">
            Customer mobile
            <input inputMode="tel" value={form.customer_phone} onChange={(event) => setForm({ ...form, customer_phone: event.target.value })} placeholder="Links it to their app" />
          </label>
        </div>
        <label className="shop-field">
          Site / note
          <input value={form.site_note} onChange={(event) => setForm({ ...form, site_note: event.target.value })} placeholder="e.g. 2nd floor, 3 bedrooms, white modular" />
        </label>
        <div className="shop-field">
          Products
          <ItemPicker picked={picked} onChange={setPicked} />
        </div>
        <FormNotice error={save.error} success={null} />
        <div className="order-actions">
          <button type="submit" className="primary-button" disabled={save.isSubmitting || !picked.length || form.title.trim().length < 3}>
            {save.isSubmitting ? "Saving…" : editingId ? "Save changes" : "Save & share"}
          </button>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={reset}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <h3 className="shop-title" style={{ fontSize: "1.25rem" }}>My selections</h3>
      <FormNotice error={action.error} success={action.success} />
      <QueryState loading={selections.loading} error={selections.error} hasData={list.length > 0} empty={{ title: "No selections yet", description: "Make your first selection above." }}>
        <div className="order-list">
          {list.map((selection) => (
            <article key={selection.id} className="order-card">
              <header>
                <div>
                  <strong>{selection.title}</strong>
                  <span className="shop-muted"> · {selection.selection_number} · {formatWhen(selection.created_at)}</span>
                </div>
                <span className={`order-status order-status--${selection.status === "closed" ? "cancelled" : selection.status === "ordered" ? "delivered" : "confirmed"}`}>
                  {SELECTION_STATUS_LABELS[selection.status]}
                </span>
              </header>
              <p className="order-note">
                For {selection.customer_name || "a customer"}
                {selection.customer_phone ? ` · ${selection.customer_phone}` : ""} ·{" "}
                {selection.customer_linked ? "in their app" : "not on the app yet"}
              </p>
              {selection.site_note ? <p className="order-note">Note: {selection.site_note}</p> : null}
              <SelectionItems selection={selection} showPrices={false} />
              <LinkedActivity selection={selection} />
              <div className="order-actions">
                <a className="secondary-button" href={whatsAppLink(selection, from)} target="_blank" rel="noreferrer">
                  Share on WhatsApp
                </a>
                {selection.status === "active" ? (
                  <button type="button" className="secondary-button" onClick={() => startEdit(selection)}>
                    Edit
                  </button>
                ) : null}
                {selection.status !== "closed" ? (
                  <button
                    type="button"
                    className="text-link-button"
                    onClick={() => window.confirm(`Close ${selection.selection_number}?`) && void action.run(() => closeSelection(selection.id), "Selection closed.")}
                  >
                    Close
                  </button>
                ) : null}
              </div>
              {selection.status !== "closed" ? (
                <details>
                  <summary className="shop-muted" style={{ cursor: "pointer" }}>Order it yourself for the site</summary>
                  <SelectionActions selection={selection} onDone={() => selections.refetch?.()} ordersHref={ordersHref} quotationsHref={quotationsHref} />
                </details>
              ) : null}
            </article>
          ))}
        </div>
      </QueryState>
    </div>
  );
}

const ADMIN_FILTERS: Array<{ id: SelectionStatus; label: string }> = [
  { id: "active", label: "Shared" },
  { id: "ordered", label: "Ordered" },
  { id: "closed", label: "Closed" }
];

/** Every selection electricians and architects made, with today's value and stock, so the shop can prepare. */
export function AdminSelectionsPage() {
  const selections = useSelections();
  const action = useMutationAction();
  const [filter, setFilter] = useState<SelectionStatus>("active");
  const all = selections.data[0]?.selections ?? [];
  const list = all.filter((selection) => selection.status === filter);

  return (
    <div className="page-stack">
      <div>
        <h2 className="shop-title">Product selections</h2>
        <p className="shop-muted">What electricians and architects have picked for their customers — keep these items in stock and expect the orders.</p>
      </div>
      <div className="pl-segment" role="radiogroup" aria-label="Selection status">
        {ADMIN_FILTERS.map((option) => {
          const count = all.filter((selection) => selection.status === option.id).length;
          return (
            <button key={option.id} type="button" role="radio" aria-checked={filter === option.id} className={filter === option.id ? "is-active" : ""} onClick={() => setFilter(option.id)}>
              {option.label}
              {count ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>
      <FormNotice error={action.error} success={action.success} />
      <QueryState loading={selections.loading} error={selections.error} hasData={list.length > 0} empty={{ title: "Nothing here", description: "Selections appear here as electricians and architects make them." }}>
        <div className="order-list">
          {list.map((selection) => (
            <article key={selection.id} className="order-card">
              <header>
                <div>
                  <strong>{selection.title}</strong>
                  <span className="shop-muted"> · {selection.selection_number} · {formatWhen(selection.created_at)}</span>
                </div>
                <span className="order-status order-status--confirmed">{SELECTION_STATUS_LABELS[selection.status]}</span>
              </header>
              <div className="order-customer">
                {selection.created_by ? (
                  <span>
                    By <strong>{selection.created_by.full_name}</strong> <span className="order-role">{selection.created_by.role}</span>
                    {selection.created_by.phone ? <> · <a href={`tel:${selection.created_by.phone}`}>{selection.created_by.phone}</a></> : null}
                  </span>
                ) : null}
                <span>
                  For {selection.customer_name || "a customer"}
                  {selection.customer_phone ? ` · ${selection.customer_phone}` : ""} · {selection.customer_linked ? "on the app" : "not on the app"}
                </span>
                {selection.site_note ? <span className="order-note">Note: {selection.site_note}</span> : null}
              </div>
              <SelectionItems selection={selection} showPrices />
              <p className="order-total">
                {selection.items.length} products · worth about <strong>{formatPriceListAmount(selection.estimated_total ?? 0)}</strong> at today&apos;s prices
              </p>
              <LinkedActivity selection={selection} />
              {selection.status !== "closed" ? (
                <button
                  type="button"
                  className="text-link-button"
                  onClick={() => window.confirm(`Close ${selection.selection_number}?`) && void action.run(() => closeSelection(selection.id), "Selection closed.")}
                >
                  Close
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
