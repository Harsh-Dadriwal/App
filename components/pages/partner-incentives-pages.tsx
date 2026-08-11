"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  CardGrid,
  DataCard,
  DataTable,
  FormCard,
  FormGrid,
  FormNotice,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import {
  deletePartnerIncentiveScheme,
  deletePartnerIncentiveSlab,
  duplicatePartnerIncentiveScheme,
  listAdminRedemptions,
  resolveRedemption,
  savePartnerIncentiveScheme,
  savePartnerIncentiveSlab
} from "@/lib/backend/modules/partner-incentives-gateway";

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
          { label: "Commission earned", value: formatMoney(summary?.commission_earned) },
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
      <PageSection title="Bonus history & transactions" description="Commission entries, tier bonuses, points credits, and future redemptions are all ledger-backed.">
        <QueryState loading={ledger.loading} error={ledger.error} hasData={ledger.data.length > 0} empty={{ title: "No transactions", description: "Transactions are created when completed orders qualify for incentives." }}>
          <DataTable
            columns={["When", "Type", "Category", "Business", "%", "Commission", "Points", "Description"]}
            rows={ledger.data.map((row: any) => [
              row.posted_at ? new Date(row.posted_at).toLocaleString("en-IN") : "-",
              row.entry_type,
              row.commission_type ?? "-",
              formatMoney(row.business_amount),
              Number(row.commission_percent ?? 0),
              formatMoney(row.commission_amount),
              formatPoints(row.points),
              row.description ?? "-"
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
  const [schemeForm, setSchemeForm] = useState({ id: "", name: "", partner_type: "all", status: "draft", effective_from: new Date().toISOString().slice(0, 10), description: "" });
  const [slabForm, setSlabForm] = useState({ id: "", scheme_id: "", tier_name: "", min_business: "0", max_business: "", wire_commission_percent: "2", other_commission_percent: "10", bonus_points: "0", color: "#b45309", icon: "award", description: "", sort_order: "0" });

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

  const activeSchemeId = useMemo(() => schemeForm.id || schemes.data[0]?.id || "", [schemeForm.id, schemes.data]);
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
      async () => savePartnerIncentiveScheme({ ...schemeForm, tenant_id: tenantId }, schemeForm.id || null),
      schemeForm.id ? "Scheme updated." : "Scheme created."
    );
    if (ok) {
      setSchemeForm({ id: "", name: "", partner_type: "all", status: "draft", effective_from: new Date().toISOString().slice(0, 10), description: "" });
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
    const ok = await mutation.run(async () => savePartnerIncentiveSlab(payload, slabForm.id || null), slabForm.id ? "Slab updated." : "Slab created.");
    if (ok) {
      setSlabForm({ id: "", scheme_id: "", tier_name: "", min_business: "0", max_business: "", wire_commission_percent: "2", other_commission_percent: "10", bonus_points: "0", color: "#b45309", icon: "award", description: "", sort_order: "0" });
      slabs.refetch?.();
    }
  }

  async function updateCategoryType(categoryId: string, commissionType: "WIRE" | "OTHER") {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(async () => client.from("product_categories").update({ commission_type: commissionType }).eq("id", categoryId), "Category commission mapping updated.");
    if (ok) categories.refetch?.();
  }

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Schemes", value: schemes.data.length },
          { label: "Slabs", value: slabs.data.length },
          { label: "Partners earning", value: reports.data.length },
          { label: "Commission", value: formatMoney(reports.data.reduce((sum: number, row: any) => sum + Number(row.commission_earned ?? 0), 0)) }
        ]}
      />
      <FormNotice error={mutation.error} success={mutation.success} />
      <FormCard title="Incentive schemes" description="Create, edit, duplicate, activate, archive, or delete configurable partner schemes.">
        <form onSubmit={saveScheme} className="form-stack">
          <FormGrid>
            <label>Scheme name<input required value={schemeForm.name} onChange={(e) => setSchemeForm((f) => ({ ...f, name: e.target.value }))} /></label>
            <label>Partner type<input value={schemeForm.partner_type} onChange={(e) => setSchemeForm((f) => ({ ...f, partner_type: e.target.value }))} placeholder="all, architect, electrician..." /></label>
            <label>Status<select value={schemeForm.status} onChange={(e) => setSchemeForm((f) => ({ ...f, status: e.target.value }))}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></label>
            <label>Effective from<input type="date" value={schemeForm.effective_from} onChange={(e) => setSchemeForm((f) => ({ ...f, effective_from: e.target.value }))} /></label>
          </FormGrid>
          <label>Description<textarea value={schemeForm.description} onChange={(e) => setSchemeForm((f) => ({ ...f, description: e.target.value }))} /></label>
          <button className="primary-button" type="submit" disabled={mutation.isSubmitting}>{schemeForm.id ? "Update scheme" : "Create scheme"}</button>
        </form>
        <QueryState loading={schemes.loading} error={schemes.error} hasData={schemes.data.length > 0} empty={{ title: "No schemes", description: "Create the first incentive scheme for this tenant." }}>
          <DataTable
            columns={["Name", "Partner type", "Status", "Effective", "Actions"]}
            rows={schemes.data.map((scheme: any) => [
              scheme.name,
              scheme.partner_type,
              scheme.status,
              scheme.effective_from,
              <span key={scheme.id} className="table-action-row"><button type="button" onClick={() => setSchemeForm({ id: scheme.id, name: scheme.name, partner_type: scheme.partner_type, status: scheme.status, effective_from: scheme.effective_from, description: scheme.description ?? "" })}>Edit</button><button type="button" onClick={() => void mutation.run(async () => duplicatePartnerIncentiveScheme(scheme.id), "Scheme duplicated.").then(() => schemes.refetch?.())}>Duplicate</button><button type="button" onClick={() => void mutation.run(async () => deletePartnerIncentiveScheme(scheme.id), "Scheme deleted.").then(() => schemes.refetch?.())}>Delete</button></span>
            ])}
          />
        </QueryState>
      </FormCard>
      <FormCard title="Slabs" description="Configure business ranges, wire/other commission, bonus points, visuals, and ordering.">
        <form onSubmit={saveSlab} className="form-stack">
          <FormGrid>
            <label>Scheme<select value={slabForm.scheme_id || activeSchemeId} onChange={(e) => setSlabForm((f) => ({ ...f, scheme_id: e.target.value }))}>{schemes.data.map((scheme: any) => <option key={scheme.id} value={scheme.id}>{scheme.name}</option>)}</select></label>
            <label>Tier name<input required value={slabForm.tier_name} onChange={(e) => setSlabForm((f) => ({ ...f, tier_name: e.target.value }))} /></label>
            <label>Min business<input type="number" value={slabForm.min_business} onChange={(e) => setSlabForm((f) => ({ ...f, min_business: e.target.value }))} /></label>
            <label>Max business<input type="number" value={slabForm.max_business} onChange={(e) => setSlabForm((f) => ({ ...f, max_business: e.target.value }))} placeholder="Blank for no cap" /></label>
            <label>Wire %<input type="number" step="0.001" value={slabForm.wire_commission_percent} onChange={(e) => setSlabForm((f) => ({ ...f, wire_commission_percent: e.target.value }))} /></label>
            <label>Other %<input type="number" step="0.001" value={slabForm.other_commission_percent} onChange={(e) => setSlabForm((f) => ({ ...f, other_commission_percent: e.target.value }))} /></label>
            <label>Bonus points<input type="number" value={slabForm.bonus_points} onChange={(e) => setSlabForm((f) => ({ ...f, bonus_points: e.target.value }))} /></label>
            <label>Sort order<input type="number" value={slabForm.sort_order} onChange={(e) => setSlabForm((f) => ({ ...f, sort_order: e.target.value }))} /></label>
          </FormGrid>
          <FormGrid>
            <label>Color<input value={slabForm.color} onChange={(e) => setSlabForm((f) => ({ ...f, color: e.target.value }))} /></label>
            <label>Icon<input value={slabForm.icon} onChange={(e) => setSlabForm((f) => ({ ...f, icon: e.target.value }))} /></label>
          </FormGrid>
          <label>Description<textarea value={slabForm.description} onChange={(e) => setSlabForm((f) => ({ ...f, description: e.target.value }))} /></label>
          <button className="primary-button" type="submit" disabled={mutation.isSubmitting}>{slabForm.id ? "Update slab" : "Create slab"}</button>
        </form>
        <QueryState loading={slabs.loading} error={slabs.error} hasData={slabs.data.length > 0} empty={{ title: "No slabs", description: "Add Bronze, Silver, Gold, Platinum, Diamond, or custom tiers." }}>
          <DataTable
            columns={["Tier", "Range", "Wire %", "Other %", "Bonus", "Order", "Actions"]}
            rows={slabs.data.map((slab: any) => [
              slab.tier_name,
              `${formatMoney(slab.min_business)} – ${slab.max_business ? formatMoney(slab.max_business) : "∞"}`,
              slab.wire_commission_percent,
              slab.other_commission_percent,
              formatPoints(slab.bonus_points),
              slab.sort_order,
              <span key={slab.id} className="table-action-row"><button type="button" onClick={() => setSlabForm({ id: slab.id, scheme_id: slab.scheme_id, tier_name: slab.tier_name, min_business: String(slab.min_business), max_business: slab.max_business ? String(slab.max_business) : "", wire_commission_percent: String(slab.wire_commission_percent), other_commission_percent: String(slab.other_commission_percent), bonus_points: String(slab.bonus_points), color: slab.color ?? "", icon: slab.icon ?? "", description: slab.description ?? "", sort_order: String(slab.sort_order ?? 0) })}>Edit</button><button type="button" onClick={() => void mutation.run(async () => deletePartnerIncentiveSlab(slab.id), "Slab deleted.").then(() => slabs.refetch?.())}>Delete</button></span>
            ])}
          />
        </QueryState>
      </FormCard>
      <PageSection title="Product category commission mapping" description="Classify categories as WIRE or OTHER. Products inherit commission type from their existing category.">
        <QueryState loading={categories.loading} error={categories.error} hasData={categories.data.length > 0} empty={{ title: "No categories", description: "Create product categories before configuring commission mapping." }}>
          <DataTable columns={["Category", "Commission type"]} rows={categories.data.map((category: any) => [category.name, <select key={category.id} value={category.commission_type ?? "OTHER"} onChange={(e) => void updateCategoryType(category.id, e.target.value as "WIRE" | "OTHER")}><option value="WIRE">WIRE</option><option value="OTHER">OTHER</option></select>])} />
        </QueryState>
      </PageSection>
      <PageSection title="Reports" description="Top partners, paid commission, business, points issued, tier distribution, and growth rollups.">
        <QueryState loading={reports.loading} error={reports.error} hasData={reports.data.length > 0} empty={{ title: "No incentive reports", description: "Reports populate as completed orders generate incentive ledger entries." }}>
          <DataTable
            columns={["Partner", "Type", "Tier", "Business", "Commission", "Points issued", "Current points"]}
            rows={reports.data.map((row: any) => [row.partner_name, row.partner_type, row.tier_name ?? "-", formatMoney(row.total_business), formatMoney(row.commission_earned), formatPoints(row.bonus_points_earned), formatPoints(row.current_points)])}
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
