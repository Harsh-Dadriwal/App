"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  CardGrid,
  DataCard,
  DataTable,
  FlowWizardSteps,
  FormCard,
  FormFieldHint,
  FormGrid,
  FormNotice,
  FormSectionHeader,
  ListSearchField,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { ELECTRICIAN_BID_STEPS } from "./shared";
export function ElectricianDashboardPage() {
  const { profile } = useAuth();
  const electricianId = profile?.id ?? "";
  const ongoing = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_electrician_ongoing_projects")
        .select("*")
        .eq("electrician_id", electricianId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [electricianId],
    { enabled: Boolean(electricianId) }
  );
  const newProjects = useRows(
    async (client) => {
      const { data, error } = await client.from("vw_electrician_new_projects").select("*");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const customerPending = ongoing.data.reduce(
    (sum, row: any) => sum + Number(row.customer_pending_items ?? 0),
    0
  );

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Open bids", value: newProjects.data.length },
          { label: "Ongoing projects", value: ongoing.data.length },
          { label: "Customer pending items", value: customerPending },
          { label: "Supplied items", value: ongoing.data.reduce((sum, row: any) => sum + Number(row.supplied_items ?? 0), 0) }
        ]}
      />
      <PageSection
        title="Electrician activity"
        description="Bid opportunities and live project progress."
      >
        <QueryState
          loading={ongoing.loading}
          error={ongoing.error}
          hasData={ongoing.data.length > 0}
          empty={{
            title: "No active electrician projects",
            description: "Projects will appear here once you are assigned to a site."
          }}
        >
          <CardGrid>
            {ongoing.data.map((project: any) => (
              <DataCard
                key={project.site_id}
                title={project.site_name}
                subtitle={project.customer_name}
                meta={project.site_status}
              >
                <p>Architect pending: {project.architect_pending_items}</p>
                <p>Customer pending: {project.customer_pending_items}</p>
                <p>Supply pending: {project.supply_pending_items}</p>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function ElectricianProjectsPage({
  mode
}: {
  mode: "new" | "market" | "ongoing";
}) {
  const { profile } = useAuth();
  const electricianId = profile?.id ?? "";
  const query = useRows(
    async (client) => {
      if (mode === "new") {
        const { data, error } = await client.from("vw_electrician_new_projects").select("*");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      if (mode === "market") {
        const { data, error } = await client.from("vw_electrician_projects_assigned_to_others").select("*");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      const { data, error } = await client
        .from("vw_electrician_ongoing_projects")
        .select("*")
        .eq("electrician_id", electricianId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [mode, electricianId],
    { enabled: mode !== "ongoing" || Boolean(electricianId) }
  );

  const titleMap = {
    new: "New projects",
    market: "Projects assigned to others",
    ongoing: "Ongoing projects"
  } as const;
  const [bidForm, setBidForm] = useState({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
  const [editingBidId, setEditingBidId] = useState<string | null>(null);
  const [bidCreateStep, setBidCreateStep] = useState(1);
  const [bidSearch, setBidSearch] = useState("");
  const mutation = useMutationAction();
  const myBids = useRows(async (client) => {
    const { data, error } = await client
      .from("project_bids")
      .select("id, site_id, bid_amount, estimated_days, notes, status")
      .eq("bidder_user_id", electricianId)
      .eq("bidder_role", "electrician")
      .order("submitted_at", { ascending: false });
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [electricianId], { enabled: Boolean(electricianId) });

  const visibleBids = useMemo(() => {
    const q = bidSearch.trim().toLowerCase();
    if (!q) return myBids.data;
    return myBids.data.filter((bid: any) =>
      [bid.site_id, bid.bid_amount, bid.status, bid.notes].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [myBids.data, bidSearch]);

  useEffect(() => {
    if (editingBidId) return;
    if (bidCreateStep >= 2 && (!bidForm.site_id || !bidForm.bid_amount.trim())) setBidCreateStep(1);
  }, [editingBidId, bidCreateStep, bidForm.site_id, bidForm.bid_amount]);

  async function saveBid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBidId && bidCreateStep < 2) return;
    const client = await getSupabaseBrowserClient();
    if (!client || !electricianId) return;
    const ok = await mutation.run(async () => {
      const payload = {
        site_id: bidForm.site_id,
        bidder_user_id: electricianId,
        bidder_role: "electrician",
        bid_amount: Number(bidForm.bid_amount),
        estimated_days: bidForm.estimated_days ? Number(bidForm.estimated_days) : null,
        notes: bidForm.notes || null
      };
      if (editingBidId) {
        return client.from("project_bids").update(payload).eq("id", editingBidId);
      }
      return client.from("project_bids").insert(payload);
    }, editingBidId ? "Bid updated successfully." : "Bid submitted successfully.");
    if (ok) {
      setEditingBidId(null);
      setBidCreateStep(1);
      setBidForm({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
      query.refetch?.();
      myBids.refetch?.();
    }
  }

  const siteNameById = useMemo(() => new Map(query.data.map((p: any) => [p.site_id, p.site_name])), [query.data]);

  return (
    <div className="page-stack">
      {mode === "new" ? (
        <FormCard
          title={editingBidId ? "Edit bid" : "Submit bid"}
          description={
            editingBidId
              ? "Update your offer on this project."
              : "Pick an open project first, then add your amount and an optional timeline."
          }
        >
          <form onSubmit={saveBid} className="auth-form">
            {!editingBidId ? <FlowWizardSteps steps={ELECTRICIAN_BID_STEPS} currentStep={bidCreateStep} ariaLabel="Steps to submit a bid" /> : null}
            {editingBidId ? <FormSectionHeader title="Bid fields" lead={<>Adjust your offer, then save.</>} /> : null}

            {!editingBidId && bidCreateStep === 1 ? (
              <div className="wizard-step-body">
                <FormGrid>
                  <label>
                    Project site
                    <select value={bidForm.site_id} onChange={(e) => setBidForm((s) => ({ ...s, site_id: e.target.value }))} required autoFocus>
                      <option value="">Choose project…</option>
                      {query.data.map((project: any) => (
                        <option key={project.site_id} value={project.site_id}>
                          {project.site_name}
                        </option>
                      ))}
                    </select>
                    <FormFieldHint>Open projects you can bid on appear in this list.</FormFieldHint>
                  </label>
                  <label>
                    Bid amount (₹)
                    <input type="number" min={0} step="0.01" value={bidForm.bid_amount} onChange={(e) => setBidForm((s) => ({ ...s, bid_amount: e.target.value }))} required />
                  </label>
                </FormGrid>
                <div className="wizard-nav">
                  <button type="button" className="primary-button" disabled={!bidForm.site_id || !bidForm.bid_amount.trim()} onClick={() => setBidCreateStep(2)}>
                    Continue
                  </button>
                </div>
              </div>
            ) : null}

            {!editingBidId && bidCreateStep === 2 ? (
              <div className="wizard-step-body">
                <label>
                  Estimated days
                  <input type="number" min={0} value={bidForm.estimated_days} onChange={(e) => setBidForm((s) => ({ ...s, estimated_days: e.target.value }))} />
                  <FormFieldHint>Optional. Leave blank if timing is flexible.</FormFieldHint>
                </label>
                <label>
                  Notes
                  <textarea value={bidForm.notes} onChange={(e) => setBidForm((s) => ({ ...s, notes: e.target.value }))} placeholder="Scope, exclusions, or assumptions" />
                </label>
                <div className="wizard-nav">
                  <button type="button" className="secondary-button" onClick={() => setBidCreateStep(1)}>
                    Back
                  </button>
                  <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                    {mutation.isSubmitting ? "Submitting..." : "Submit bid"}
                  </button>
                </div>
              </div>
            ) : null}

            {editingBidId ? (
              <>
                <FormGrid>
                  <label>
                    Site
                    <select value={bidForm.site_id} onChange={(e) => setBidForm((s) => ({ ...s, site_id: e.target.value }))} required>
                      <option value="">Select project</option>
                      {query.data.map((project: any) => (
                        <option key={project.site_id} value={project.site_id}>
                          {project.site_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bid amount (₹)
                    <input type="number" value={bidForm.bid_amount} onChange={(e) => setBidForm((s) => ({ ...s, bid_amount: e.target.value }))} required />
                  </label>
                  <label>
                    Estimated days
                    <input type="number" value={bidForm.estimated_days} onChange={(e) => setBidForm((s) => ({ ...s, estimated_days: e.target.value }))} />
                  </label>
                </FormGrid>
                <label>
                  Notes
                  <textarea value={bidForm.notes} onChange={(e) => setBidForm((s) => ({ ...s, notes: e.target.value }))} />
                </label>
                <div className="form-actions">
                  <button className="primary-button" disabled={mutation.isSubmitting} type="submit">
                    {mutation.isSubmitting ? "Saving..." : "Update bid"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setEditingBidId(null);
                      setBidCreateStep(1);
                      setBidForm({ site_id: "", bidder_role: "electrician", bid_amount: "", estimated_days: "", notes: "" });
                      mutation.reset();
                    }}
                  >
                    Cancel edit
                  </button>
                </div>
              </>
            ) : null}
            <FormNotice error={mutation.error} success={mutation.success} />
          </form>
        </FormCard>
      ) : null}
      {mode === "new" ? (
        <PageSection title="My bids" description="Search by site, amount, or status. Edit any bid you submitted.">
          <QueryState
            loading={myBids.loading}
            error={myBids.error}
            hasData={myBids.data.length > 0}
            empty={{ title: "No bids yet", description: "Submitted bids will appear here for quick edits." }}
          >
            <ListSearchField value={bidSearch} onChange={setBidSearch} placeholder="Search your bids" ariaLabel="Search bids" />
            <QueryState
              loading={false}
              error={null}
              hasData={visibleBids.length > 0}
              empty={{ title: "No matching bids", description: "Try another search or clear the filter." }}
            >
              <CardGrid>
                {visibleBids.map((bid: any) => (
                  <DataCard
                    key={bid.id}
                    title={siteNameById.get(bid.site_id) ?? bid.site_id}
                    subtitle={`₹${Number(bid.bid_amount ?? 0).toLocaleString("en-IN")}`}
                    meta={bid.status}
                  >
                    <p>Estimated days: {bid.estimated_days ?? "-"}</p>
                    <p>{bid.notes ?? "No notes added."}</p>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setEditingBidId(bid.id);
                          setBidCreateStep(1);
                          setBidForm({
                            site_id: bid.site_id ?? "",
                            bidder_role: "electrician",
                            bid_amount: String(bid.bid_amount ?? ""),
                            estimated_days: bid.estimated_days ? String(bid.estimated_days) : "",
                            notes: bid.notes ?? ""
                          });
                          mutation.reset();
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  </DataCard>
                ))}
              </CardGrid>
            </QueryState>
          </QueryState>
        </PageSection>
      ) : null}
      <PageSection
        title={titleMap[mode]}
        description="Live project progress."
      >
        <QueryState
          loading={query.loading}
          error={query.error}
          hasData={query.data.length > 0}
          empty={{
            title: "No matching projects",
            description: "Matching projects will appear here."
          }}
        >
          <DataTable
            columns={
              mode === "ongoing"
                ? ["Site", "Customer", "Status", "Architect Pending", "Customer Pending", "Supplied"]
                : ["Site", "Project Type", "City", "State", "Budget", "Status"]
            }
            rows={
              mode === "ongoing"
                ? query.data.map((row: any) => [
                    row.site_name,
                    row.customer_name,
                    row.site_status,
                    row.architect_pending_items,
                    row.customer_pending_items,
                    row.supplied_items
                  ])
                : query.data.map((row: any) => [
                    row.site_name,
                    row.project_type,
                    row.city,
                    row.state,
                    row.estimated_budget ? `₹${Number(row.estimated_budget).toLocaleString("en-IN")}` : "-",
                    row.status
                  ])
            }
          />
        </QueryState>
      </PageSection>
    </div>
  );
}
