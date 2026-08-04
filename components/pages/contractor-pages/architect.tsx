"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { OrderWorkflowTimeline } from "@/components/order-workflow";
import {
  CardGrid,
  DataCard,
  DataTable,
  FormNotice,
  ListSearchField,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { reviewOrderItemByArchitect } from "@/lib/backend/modules/workflow-gateway";
export function ArchitectDashboardPage() {
  const { profile } = useAuth();
  const architectId = profile?.id ?? "";
  const ongoing = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_architect_ongoing_projects")
        .select("*")
        .eq("architect_id", architectId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [architectId],
    { enabled: Boolean(architectId) }
  );
  const newProjects = useRows(
    async (client) => {
      const { data, error } = await client.from("vw_architect_new_projects").select("*");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Open projects", value: newProjects.data.length },
          { label: "Ongoing projects", value: ongoing.data.length },
          { label: "Customer pending items", value: ongoing.data.reduce((sum, row: any) => sum + Number(row.customer_pending_items ?? 0), 0) },
          { label: "Supplied items", value: ongoing.data.reduce((sum, row: any) => sum + Number(row.supplied_items ?? 0), 0) }
        ]}
      />
      <PageSection
        title="Architect review flow"
        description="Architect pages read directly from project and material review views."
      >
        <QueryState
          loading={ongoing.loading}
          error={ongoing.error}
          hasData={ongoing.data.length > 0}
          empty={{
            title: "No architect-assigned projects",
            description: "Assign an architect to a site to see it appear here."
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
                <p>Electrician: {project.electrician_name ?? "-"}</p>
                <p>Awaiting customer: {project.customer_pending_items}</p>
                <p>Awaiting supply: {project.supply_pending_items}</p>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
    </div>
  );
}

export function ArchitectProjectsPage({ mode }: { mode: "new" | "ongoing" }) {
  const { profile } = useAuth();
  const architectId = profile?.id ?? "";
  const query = useRows(
    async (client) => {
      if (mode === "new") {
        const { data, error } = await client.from("vw_architect_new_projects").select("*");
        return { data: (data ?? []) as any[], error: error?.message ?? null };
      }

      const { data, error } = await client
        .from("vw_architect_ongoing_projects")
        .select("*")
        .eq("architect_id", architectId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [mode, architectId],
    { enabled: mode !== "ongoing" || Boolean(architectId) }
  );

  return (
    <PageSection
      title={mode === "new" ? "New architect projects" : "Ongoing architect projects"}
      description="Projects are sourced from architect-specific database views."
    >
      <QueryState
        loading={query.loading}
        error={query.error}
        hasData={query.data.length > 0}
        empty={{
          title: "No project data",
          description: "Rows will appear here as soon as the underlying view returns records."
        }}
      >
        <DataTable
          columns={
            mode === "new"
              ? ["Site", "Project Type", "City", "Budget", "Status"]
              : ["Site", "Customer", "Status", "Requested by Electrician", "Customer Pending", "Supplied"]
          }
          rows={
            mode === "new"
              ? query.data.map((row: any) => [
                  row.site_name,
                  row.project_type,
                  row.city,
                  row.estimated_budget ? `₹${Number(row.estimated_budget).toLocaleString("en-IN")}` : "-",
                  row.status
                ])
              : query.data.map((row: any) => [
                  row.site_name,
                  row.customer_name,
                  row.site_status,
                  row.electrician_requested_items,
                  row.customer_pending_items,
                  row.supplied_items
                ])
          }
        />
      </QueryState>
    </PageSection>
  );
}

export function ArchitectMaterialsPage() {
  const { profile } = useAuth();
  const architectId = profile?.id ?? "";
  const [archMaterialSearch, setArchMaterialSearch] = useState("");
  const [selectedWorkflowItemId, setSelectedWorkflowItemId] = useState<string | null>(null);
  const materials = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_architect_material_tracker")
        .select("*")
        .eq("architect_id", architectId);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [architectId],
    { enabled: Boolean(architectId) }
  );

  const mutation = useMutationAction();

  async function reviewItem(orderItemId: string, approve: boolean) {
    const ok = await mutation.run(async () => reviewOrderItemByArchitect({
      target_order_item_id: orderItemId,
      approve,
      note_text: approve ? "Approved by architect" : "Rejected by architect"
    }), approve ? "Item approved by architect." : "Item rejected by architect.");
    if (ok) materials.refetch?.();
  }

  const visibleArchMaterials = useMemo(() => {
    const q = archMaterialSearch.trim().toLowerCase();
    if (!q) return materials.data;
    return materials.data.filter((item: any) =>
      [item.item_name_snapshot, item.site_name, item.status].some((value) => String(value ?? "").toLowerCase().includes(q))
    );
  }, [materials.data, archMaterialSearch]);

  useEffect(() => {
    if (!selectedWorkflowItemId && visibleArchMaterials[0]?.order_item_id) {
      setSelectedWorkflowItemId(visibleArchMaterials[0].order_item_id);
    }
  }, [visibleArchMaterials, selectedWorkflowItemId]);

  return (
    <div className="page-stack">
      <PageSection
        title="Architect material tracker"
        description="Search lines like the electrician tracker. Approve or reject when status is pending architect review."
      >
        <QueryState
          loading={materials.loading}
          error={materials.error}
          hasData={materials.data.length > 0}
          empty={{
            title: "No material tracker records",
            description: "Add order items to architect-associated sites to populate this view."
          }}
        >
          <FormNotice error={mutation.error} success={mutation.success} />
          <ListSearchField
            value={archMaterialSearch}
            onChange={setArchMaterialSearch}
            placeholder="Search by item, site, or status"
            ariaLabel="Search architect materials"
          />
          <QueryState
            loading={false}
            error={null}
            hasData={visibleArchMaterials.length > 0}
            empty={{ title: "No matching lines", description: "Try another search or clear the filter." }}
          >
            <CardGrid>
              {visibleArchMaterials.map((item: any) => (
                <DataCard key={item.order_item_id} title={item.item_name_snapshot} subtitle={item.site_name} meta={item.status}>
                  <p>Required: {item.quantity_required}</p>
                  <p>Approved: {item.quantity_approved ?? "-"}</p>
                  <p>Supplied: {item.quantity_supplied}</p>
                  {item.status === "pending_architect_approval" ? (
                    <div className="inline-actions">
                      <button type="button" className="primary-button" disabled={mutation.isSubmitting} onClick={() => void reviewItem(item.order_item_id, true)}>
                        Approve
                      </button>
                      <button type="button" className="secondary-button" disabled={mutation.isSubmitting} onClick={() => void reviewItem(item.order_item_id, false)}>
                        Reject
                      </button>
                      <button type="button" className="secondary-button" onClick={() => setSelectedWorkflowItemId(item.order_item_id)}>
                        Timeline
                      </button>
                    </div>
                  ) : (
                    <div className="inline-actions">
                      <button type="button" className="secondary-button" onClick={() => setSelectedWorkflowItemId(item.order_item_id)}>
                        Timeline
                      </button>
                    </div>
                  )}
                </DataCard>
              ))}
            </CardGrid>
          </QueryState>
        </QueryState>
      </PageSection>
      <OrderWorkflowTimeline
        entityType="order_item"
        entityId={selectedWorkflowItemId}
        title="Architect workflow timeline"
        description="Track approvals, substitute detours, and supply updates for the currently selected material line."
      />
    </div>
  );
}
