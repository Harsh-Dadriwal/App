"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  CardGrid,
  DataCard,
  DataTable,
  FormGrid,
  FormNotice,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { incentiveWording } from "@mahalaxmi/core/gateway/partner-incentives-gateway";
import { useAuth } from "@/components/providers/auth-provider";
import {
  deletePartnerIncentiveScheme,
  deletePartnerIncentiveSlab,
  duplicatePartnerIncentiveScheme,
  resolveRedemption,
  savePartnerIncentiveScheme,
  savePartnerIncentiveSlab
} from "@/lib/backend/modules/partner-incentives-gateway";

type Audience = "electrician" | "architect" | "all";

const AUDIENCES: Array<{ id: Audience; label: string; hint: string; icon: string }> = [
  { id: "electrician", label: "Electricians", hint: "What electricians earn", icon: "⚡" },
  { id: "architect", label: "Architects", hint: "What architects earn", icon: "📐" },
  { id: "all", label: "Everyone else", hint: "Fallback for others", icon: "👥" }
];

const EMPTY_SCHEME_FORM = { id: "", name: "", partner_type: "electrician", status: "active", effective_from: new Date().toISOString().slice(0, 10), description: "" };
const EMPTY_SLAB_FORM = { id: "", scheme_id: "", tier_name: "", min_business: "0", max_business: "", wire_commission_percent: "2", other_commission_percent: "10", bonus_points: "0", color: "#b45309", icon: "award", description: "", sort_order: "0" };

function audienceLabel(audience: Audience) {
  return AUDIENCES.find((option) => option.id === audience)?.label ?? audience;
}

/** One plain sentence, e.g. "Electricians earn 2% on wires and 5% on everything else. No tier bonus." */
function describeScheme(audience: Audience, tiers: any[]) {
  if (!tiers.length) return "No tiers yet, so nobody earns from this scheme.";
  const range = (values: number[]) => {
    const unique = [...new Set(values)].sort((a, b) => a - b);
    return unique.length === 1 ? `${unique[0]}%` : `${unique[0]}–${unique[unique.length - 1]}%`;
  };
  const wire = range(tiers.map((tier) => Number(tier.wire_commission_percent)));
  const other = range(tiers.map((tier) => Number(tier.other_commission_percent)));
  const withBonus = tiers.filter((tier) => Number(tier.bonus_points) > 0);
  const who = audience === "all" ? "Partners without their own scheme" : audienceLabel(audience);
  return `${who} earn ${wire} on wires and ${other} on everything else, on orders delivered. ${
    withBonus.length ? `Reaching ${withBonus.map((tier) => tier.tier_name).join(", ")} gives bonus points.` : "No tier bonus."
  }`;
}

function partnerTypeLabel(type: string | null | undefined) {
  const value = (type ?? "").toLowerCase();
  if (value === "electrician") return "Electricians";
  if (value === "architect") return "Architects";
  if (value === "all") return "Everyone";
  return type || "-";
}

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function formatMoney(value: unknown) {
  return money.format(Number(value ?? 0));
}

function formatPoints(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-IN");
}

export function PartnerIncentivesPage() {
  const { profile, activeTenant } = useAuth();
  const partnerId = profile?.id;
  const tenantId = activeTenant?.id;
  const currentYear = new Date().getFullYear();

  const progress = useRows(
    async (client) => {
      if (!partnerId || !tenantId) return { data: [], error: null };
      const { data, error } = await client
        .from("vw_partner_incentive_progress")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("partner_id", partnerId)
        .eq("business_year", currentYear);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [partnerId, tenantId, currentYear],
    { realtimeTable: "partner_business_summary", enabled: Boolean(partnerId && tenantId) }
  );
  const ledger = useRows(
    async (client) => {
      if (!partnerId || !tenantId) return { data: [], error: null };
      const { data, error } = await client
        .from("partner_commission_ledger")
        .select("entry_type, commission_type, business_amount, commission_percent, commission_amount, points, description, posted_at")
        .eq("tenant_id", tenantId)
        .eq("partner_id", partnerId)
        .order("posted_at", { ascending: false })
        .limit(50);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [partnerId, tenantId],
    { realtimeTable: "partner_commission_ledger", enabled: Boolean(partnerId && tenantId) }
  );

  const summary = progress.data[0] as any | undefined;
  const nextTarget = Number(summary?.next_tier_min_business ?? summary?.total_business ?? 0);
  const total = Number(summary?.total_business ?? 0);
  const progressPercent = nextTarget > 0 ? Math.min(100, Math.round((total / nextTarget) * 100)) : 100;

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Current tier", value: summary?.current_tier ?? "Not started" },
          { label: "Business this year", value: formatMoney(summary?.total_business) },
          { label: "Incentives earned", value: formatMoney(summary?.commission_earned) },
          { label: "Current points", value: formatPoints(summary?.current_points) }
        ]}
      />
      <PageSection title="Tier progress" description="Your incentive status updates automatically when supplied order items are completed.">
        <QueryState loading={progress.loading} error={progress.error} hasData={Boolean(summary)} empty={{ title: "No incentives yet", description: "Completed partner-linked orders will appear here once a scheme is active." }}>
          <CardGrid>
            <DataCard title={summary?.current_tier ?? "Current tier"} meta={summary?.scheme_name ?? "Active scheme"}>
              <p>{formatMoney(summary?.business_to_next_tier)} to {summary?.next_tier ?? "top tier"}</p>
              <div className="progress-track"><span style={{ width: `${progressPercent}%` }} /></div>
            </DataCard>
            <DataCard title="Business mix" meta="WIRE / OTHER">
              <p>{formatMoney(summary?.wire_business)} wire · {formatMoney(summary?.other_business)} other</p>
            </DataCard>
          </CardGrid>
        </QueryState>
      </PageSection>
      <PageSection title="Bonus history & transactions" description="Incentives, tier bonuses, points credits and redemptions, all recorded in one history.">
        <QueryState loading={ledger.loading} error={ledger.error} hasData={ledger.data.length > 0} empty={{ title: "No transactions", description: "Transactions are created when completed orders qualify for incentives." }}>
          <DataTable
            columns={["When", "Type", "Category", "Business", "%", "Incentive", "Points", "Description"]}
            rows={ledger.data.map((row: any) => [
              row.posted_at ? new Date(row.posted_at).toLocaleString("en-IN") : "-",
              incentiveWording(row.entry_type),
              row.commission_type ?? "-",
              formatMoney(row.business_amount),
              Number(row.commission_percent ?? 0),
              formatMoney(row.commission_amount),
              formatPoints(row.points),
              incentiveWording(row.description) || "-"
            ])}
          />
        </QueryState>
      </PageSection>
    </div>
  );
}

export function AdminPartnerIncentivesPage() {
  const { activeTenant } = useAuth();
  const mutation = useMutationAction();
  const tenantId = activeTenant?.id;
  const [schemeForm, setSchemeForm] = useState(EMPTY_SCHEME_FORM);
  const [slabForm, setSlabForm] = useState(EMPTY_SLAB_FORM);

  const schemes = useRows(
    async (client) => {
      if (!tenantId) return { data: [], error: null };
      const { data, error } = await client.from("partner_incentive_schemes").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId],
    { realtimeTable: "partner_incentive_schemes", enabled: Boolean(tenantId) }
  );
  const slabs = useRows(
    async (client) => {
      if (!tenantId) return { data: [], error: null };
      const { data, error } = await client.from("partner_incentive_slabs").select("*").eq("tenant_id", tenantId).order("sort_order", { ascending: true });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId],
    { realtimeTable: "partner_incentive_slabs", enabled: Boolean(tenantId) }
  );
  const reports = useRows(
    async (client) => {
      if (!tenantId) return { data: [], error: null };
      const { data, error } = await client.from("vw_partner_incentive_reports").select("*").eq("tenant_id", tenantId).order("total_business", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId],
    { realtimeTable: "partner_business_summary", enabled: Boolean(tenantId) }
  );
  const categories = useRows(
    async (client) => {
      if (!tenantId) return { data: [], error: null };
      const { data, error } = await client.from("product_categories").select("id, name, commission_type").eq("tenant_id", tenantId).order("name");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId],
    { realtimeTable: "product_categories", enabled: Boolean(tenantId) }
  );

  const [audience, setAudience] = useState<Audience>("electrician");
  const [tierFormOpen, setTierFormOpen] = useState(false);
  const [schemeFormOpen, setSchemeFormOpen] = useState(false);
  const audienceSchemes = useMemo(
    () => schemes.data.filter((scheme: any) => (scheme.partner_type ?? "").toLowerCase() === audience),
    [schemes.data, audience]
  );
  // The scheme that pays this audience today: the active one, else the newest.
  const currentScheme = audienceSchemes.find((scheme: any) => scheme.status === "active") ?? audienceSchemes[0];
  const tiers = useMemo(
    () => slabs.data.filter((slab: any) => slab.scheme_id === currentScheme?.id).sort((a: any, b: any) => Number(a.min_business) - Number(b.min_business)),
    [slabs.data, currentScheme?.id]
  );
  const activeSchemeId = currentScheme?.id ?? "";
  const [redemptionStatusFilter, setRedemptionStatusFilter] = useState("");

  const redemptions = useRows(
    async (client) => {
      if (!tenantId) return { data: [], error: null };
      let query = client
        .from("partner_reward_redemptions")
        .select("*, partner:users!partner_reward_redemptions_partner_id_fkey(id, full_name, role)")
        .eq("tenant_id", tenantId)
        .order("requested_at", { ascending: false })
        .limit(200);
      if (redemptionStatusFilter) query = query.eq("status", redemptionStatusFilter);
      const { data, error } = await query;
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId, redemptionStatusFilter],
    { realtimeTable: "partner_reward_redemptions", enabled: Boolean(tenantId) }
  );

  async function saveScheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutation.run(
      async () => savePartnerIncentiveScheme({ ...schemeForm, partner_type: schemeForm.id ? schemeForm.partner_type : audience, tenant_id: tenantId }, schemeForm.id || null),
      schemeForm.id ? "Scheme updated." : "Scheme created."
    );
    if (ok) {
      setSchemeForm(EMPTY_SCHEME_FORM);
      setSchemeFormOpen(false);
      schemes.refetch?.();
    }
  }

  async function saveSlab(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      tenant_id: tenantId,
      scheme_id: slabForm.scheme_id || activeSchemeId,
      tier_name: slabForm.tier_name,
      min_business: Number(slabForm.min_business || 0),
      max_business: slabForm.max_business ? Number(slabForm.max_business) : null,
      wire_commission_percent: Number(slabForm.wire_commission_percent || 0),
      other_commission_percent: Number(slabForm.other_commission_percent || 0),
      bonus_points: Number(slabForm.bonus_points || 0),
      color: slabForm.color,
      icon: slabForm.icon,
      description: slabForm.description,
      sort_order: Number(slabForm.sort_order || 0),
      is_active: true
    };
    const ok = await mutation.run(async () => savePartnerIncentiveSlab(payload, slabForm.id || null), slabForm.id ? "Tier saved." : "Tier added.");
    if (ok) {
      setSlabForm(EMPTY_SLAB_FORM);
      setTierFormOpen(false);
      slabs.refetch?.();
    }
  }

  async function updateCategoryType(categoryId: string, commissionType: "WIRE" | "OTHER") {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(async () => client.from("product_categories").update({ commission_type: commissionType }).eq("id", categoryId), "Category incentive type updated.");
    if (ok) categories.refetch?.();
  }

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Active schemes", value: schemes.data.filter((scheme: any) => scheme.status === "active").length },
          { label: "Tiers", value: slabs.data.length },
          { label: "Partners earning", value: reports.data.length },
          { label: "Incentives paid", value: formatMoney(reports.data.reduce((sum: number, row: any) => sum + Number(row.commission_earned ?? 0), 0)) }
        ]}
      />
      <FormNotice error={mutation.error} success={mutation.success} />
      <div className="incentive-audience-tabs" role="tablist" aria-label="Who the incentives are for">
        {AUDIENCES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={audience === option.id}
            className={`incentive-audience incentive-audience--${option.id}${audience === option.id ? " is-active" : ""}`}
            onClick={() => {
              setAudience(option.id);
              setTierFormOpen(false);
              setSchemeFormOpen(false);
            }}
          >
            <span className="incentive-audience-icon" aria-hidden="true">{option.icon}</span>
            <span>
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </span>
          </button>
        ))}
      </div>

      <section className={`incentive-panel incentive-panel--${audience}`}>
        {currentScheme ? (
          <>
            <header className="incentive-panel-head">
              <div>
                <span className="incentive-kicker">{audienceLabel(audience)} scheme</span>
                <h3>{currentScheme.name}</h3>
                <p>{describeScheme(audience, tiers)}</p>
              </div>
              <span className={`order-status order-status--${currentScheme.status === "active" ? "delivered" : "submitted"}`}>
                {currentScheme.status === "active" ? `Active since ${new Date(`${currentScheme.effective_from}T00:00:00`).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : currentScheme.status}
              </span>
            </header>

            <div className="incentive-tiers">
              {tiers.map((slab: any) => (
                <article key={slab.id} className="incentive-tier">
                  <span className="incentive-tier-name" style={{ color: slab.color || undefined }}>{slab.tier_name}</span>
                  <span className="incentive-tier-range">
                    {slab.max_business ? `${formatMoney(slab.min_business)} – ${formatMoney(slab.max_business)}` : `${formatMoney(slab.min_business)} and above`}
                    <small> business in a year</small>
                  </span>
                  <dl>
                    <div><dt>Wires</dt><dd>{Number(slab.wire_commission_percent)}%</dd></div>
                    <div><dt>Everything else</dt><dd>{Number(slab.other_commission_percent)}%</dd></div>
                    <div><dt>Tier bonus</dt><dd>{Number(slab.bonus_points) ? `${formatPoints(slab.bonus_points)} pts` : "None"}</dd></div>
                  </dl>
                  <span className="table-action-row">
                    <button
                      type="button"
                      onClick={() => {
                        setSlabForm({ id: slab.id, scheme_id: slab.scheme_id, tier_name: slab.tier_name, min_business: String(slab.min_business), max_business: slab.max_business ? String(slab.max_business) : "", wire_commission_percent: String(slab.wire_commission_percent), other_commission_percent: String(slab.other_commission_percent), bonus_points: String(slab.bonus_points), color: slab.color ?? "", icon: slab.icon ?? "", description: slab.description ?? "", sort_order: String(slab.sort_order ?? 0) });
                        setTierFormOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => window.confirm(`Delete the ${slab.tier_name} tier?`) && void mutation.run(async () => deletePartnerIncentiveSlab(slab.id), "Tier deleted.").then(() => slabs.refetch?.())}>
                      Delete
                    </button>
                  </span>
                </article>
              ))}
              {!tiers.length ? <p className="shop-muted">No tiers yet. Add the first one below.</p> : null}
            </div>

            <div className="order-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setSlabForm({ ...EMPTY_SLAB_FORM, scheme_id: currentScheme.id, other_commission_percent: audience === "electrician" ? "5" : "10" });
                  setTierFormOpen(true);
                }}
              >
                + Add tier
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSchemeForm({ id: currentScheme.id, name: currentScheme.name, partner_type: currentScheme.partner_type, status: currentScheme.status, effective_from: currentScheme.effective_from, description: currentScheme.description ?? "" });
                  setSchemeFormOpen(true);
                }}
              >
                Scheme settings
              </button>
              <button type="button" className="secondary-button" onClick={() => void mutation.run(async () => duplicatePartnerIncentiveScheme(currentScheme.id), "Scheme copied as a draft.").then(() => schemes.refetch?.())}>
                Copy as new draft
              </button>
            </div>
          </>
        ) : (
          <div className="state-card">
            <strong>No scheme for {audienceLabel(audience).toLowerCase()} yet</strong>
            <p>{audienceLabel(audience)} earn nothing until a scheme is set up.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setSchemeForm({ ...EMPTY_SCHEME_FORM, name: `${audienceLabel(audience).replace(/s$/, "")} incentive scheme`, partner_type: audience, status: "active" });
                setSchemeFormOpen(true);
              }}
            >
              Create {audienceLabel(audience).toLowerCase()} scheme
            </button>
          </div>
        )}

        {tierFormOpen ? (
          <form onSubmit={saveSlab} className="form-stack incentive-form">
            <h4>{slabForm.id ? `Edit ${slabForm.tier_name || "tier"}` : "New tier"} · {audienceLabel(audience)}</h4>
            <FormGrid>
              <label>Tier name<input required value={slabForm.tier_name} onChange={(e) => setSlabForm((f) => ({ ...f, tier_name: e.target.value }))} placeholder="e.g. Gold" /></label>
              <label>Yearly business from ₹<input type="number" value={slabForm.min_business} onChange={(e) => setSlabForm((f) => ({ ...f, min_business: e.target.value }))} /></label>
              <label>Up to ₹ (blank = no limit)<input type="number" value={slabForm.max_business} onChange={(e) => setSlabForm((f) => ({ ...f, max_business: e.target.value }))} /></label>
              <label>Incentive on wires %<input type="number" step="0.001" value={slabForm.wire_commission_percent} onChange={(e) => setSlabForm((f) => ({ ...f, wire_commission_percent: e.target.value }))} /></label>
              <label>Incentive on everything else %<input type="number" step="0.001" value={slabForm.other_commission_percent} onChange={(e) => setSlabForm((f) => ({ ...f, other_commission_percent: e.target.value }))} /></label>
              <label>Bonus points on reaching this tier<input type="number" value={slabForm.bonus_points} onChange={(e) => setSlabForm((f) => ({ ...f, bonus_points: e.target.value }))} /></label>
              <label>Display order<input type="number" value={slabForm.sort_order} onChange={(e) => setSlabForm((f) => ({ ...f, sort_order: e.target.value }))} /></label>
              <label>Colour<input value={slabForm.color} onChange={(e) => setSlabForm((f) => ({ ...f, color: e.target.value }))} /></label>
            </FormGrid>
            <div className="order-actions">
              <button className="primary-button" type="submit" disabled={mutation.isSubmitting}>{slabForm.id ? "Save tier" : "Add tier"}</button>
              <button className="secondary-button" type="button" onClick={() => setTierFormOpen(false)}>Cancel</button>
            </div>
          </form>
        ) : null}

        {schemeFormOpen ? (
          <form onSubmit={saveScheme} className="form-stack incentive-form">
            <h4>{schemeForm.id ? "Scheme settings" : "New scheme"} · {audienceLabel(audience)}</h4>
            <FormGrid>
              <label>Scheme name<input required value={schemeForm.name} onChange={(e) => setSchemeForm((f) => ({ ...f, name: e.target.value }))} /></label>
              <label>Status<select value={schemeForm.status} onChange={(e) => setSchemeForm((f) => ({ ...f, status: e.target.value }))}><option value="draft">Draft (not paying)</option><option value="active">Active (paying)</option><option value="archived">Archived</option></select></label>
              <label>Starts on<input type="date" value={schemeForm.effective_from} onChange={(e) => setSchemeForm((f) => ({ ...f, effective_from: e.target.value }))} /></label>
            </FormGrid>
            <label>Description<textarea value={schemeForm.description} onChange={(e) => setSchemeForm((f) => ({ ...f, description: e.target.value }))} /></label>
            <div className="order-actions">
              <button className="primary-button" type="submit" disabled={mutation.isSubmitting}>{schemeForm.id ? "Save scheme" : "Create scheme"}</button>
              <button className="secondary-button" type="button" onClick={() => setSchemeFormOpen(false)}>Cancel</button>
            </div>
          </form>
        ) : null}

        {audienceSchemes.length > 1 ? (
          <details className="incentive-other-schemes">
            <summary>Other {audienceLabel(audience).toLowerCase()} schemes ({audienceSchemes.length - 1})</summary>
            <DataTable
              columns={["Name", "Status", "Starts on", "Actions"]}
              rows={audienceSchemes
                .filter((scheme: any) => scheme.id !== currentScheme?.id)
                .map((scheme: any) => [
                  scheme.name,
                  scheme.status,
                  scheme.effective_from,
                  <span key={scheme.id} className="table-action-row">
                    <button type="button" onClick={() => { setSchemeForm({ id: scheme.id, name: scheme.name, partner_type: scheme.partner_type, status: scheme.status, effective_from: scheme.effective_from, description: scheme.description ?? "" }); setSchemeFormOpen(true); }}>Edit</button>
                    <button type="button" onClick={() => window.confirm(`Delete ${scheme.name}?`) && void mutation.run(async () => deletePartnerIncentiveScheme(scheme.id), "Scheme deleted.").then(() => schemes.refetch?.())}>Delete</button>
                  </span>
                ])}
            />
          </details>
        ) : null}
      </section>
      <PageSection title="Product category incentive types" description="Classify categories as WIRE or OTHER. Products get the incentive type of their category.">
        <QueryState loading={categories.loading} error={categories.error} hasData={categories.data.length > 0} empty={{ title: "No categories", description: "Create product categories before setting incentive types." }}>
          <DataTable columns={["Category", "Incentive type"]} rows={categories.data.map((category: any) => [category.name, <select key={category.id} value={category.commission_type ?? "OTHER"} onChange={(e) => void updateCategoryType(category.id, e.target.value as "WIRE" | "OTHER")}><option value="WIRE">WIRE</option><option value="OTHER">OTHER</option></select>])} />
        </QueryState>
      </PageSection>
      <PageSection title="Reports" description="Top partners, incentives paid, business, points issued, tier distribution and growth.">
        <QueryState loading={reports.loading} error={reports.error} hasData={reports.data.length > 0} empty={{ title: "No incentive reports", description: "Reports appear as completed orders earn incentives." }}>
          <DataTable
            columns={["Partner", "Type", "Tier", "Business", "Incentives", "Points issued", "Current points"]}
            rows={reports.data.map((row: any) => [row.partner_name, partnerTypeLabel(row.partner_type), row.tier_name ?? "-", formatMoney(row.total_business), formatMoney(row.commission_earned), formatPoints(row.bonus_points_earned), formatPoints(row.current_points)])}
          />
        </QueryState>
      </PageSection>
      <PageSection
        title="Reward redemptions"
        description="Review and process partner reward redemption requests. Partners submit requests; admins approve, reject, fulfil, or cancel them."
      >
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontWeight: 600 }}>Filter by status:</label>
          <select value={redemptionStatusFilter} onChange={(e) => setRedemptionStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="requested">Requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <QueryState
          loading={redemptions.loading}
          error={redemptions.error}
          hasData={redemptions.data.length > 0}
          empty={{ title: "No redemption requests", description: "Partner reward redemption requests will appear here once partners submit them." }}
        >
          <DataTable
            columns={["Partner", "Role", "Reward", "Points", "Status", "Requested", "Actions"]}
            rows={redemptions.data.map((row: any) => [
              row.partner?.full_name ?? "-",
              row.partner?.role ?? "-",
              row.reward_name,
              formatPoints(row.points),
              row.status,
              row.requested_at ? new Date(row.requested_at).toLocaleDateString("en-IN") : "-",
              <span key={row.id} className="table-action-row">
                {row.status === "requested" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void mutation.run(async () => resolveRedemption(row.id, "approved"), "Redemption approved.").then(() => redemptions.refetch?.())}
                    >Approve</button>
                    <button
                      type="button"
                      onClick={() => void mutation.run(async () => resolveRedemption(row.id, "rejected"), "Redemption rejected.").then(() => redemptions.refetch?.())}
                    >Reject</button>
                  </>
                )}
                {row.status === "approved" && (
                  <button
                    type="button"
                    onClick={() => void mutation.run(async () => resolveRedemption(row.id, "fulfilled"), "Redemption fulfilled.").then(() => redemptions.refetch?.())}
                  >Mark fulfilled</button>
                )}
                {(row.status === "requested" || row.status === "approved") && (
                  <button
                    type="button"
                    onClick={() => void mutation.run(async () => resolveRedemption(row.id, "cancelled"), "Redemption cancelled.").then(() => redemptions.refetch?.())}
                  >Cancel</button>
                )}
              </span>
            ])}
          />
        </QueryState>
      </PageSection>
    </div>
  );
}
