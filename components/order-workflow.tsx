"use client";

import { useMemo, useState } from "react";
import { PageSection, QueryState, DataTable, useRows } from "@/components/data-view";

export function AdminWorkflowMonitor() {
  const recentEvents = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_recent_order_workflow_events")
        .select("event_type, entity_type, actor_name, order_number, site_name, item_name_snapshot, source_module, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const stuck = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_stuck_order_workflows")
        .select("entity_type, entity_label, order_number, site_name, current_status, hours_in_state")
        .order("hours_in_state", { ascending: false })
        .limit(8);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const actors = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_order_workflow_actor_history")
        .select("actor_name, entity_type, event_count, last_event_at")
        .order("last_event_at", { ascending: false })
        .limit(8);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  return (
    <PageSection
      title="Workflow visibility"
      description="This is the new system backbone layer: recent order events, stuck workflows, and actor history pulled from system tables instead of hidden UI logic."
    >
      <div className="workflow-monitor-grid">
        <QueryState
          loading={recentEvents.loading}
          error={recentEvents.error}
          hasData={recentEvents.data.length > 0}
          empty={{ title: "No workflow events yet", description: "Run order approvals or supply actions to populate the event stream." }}
        >
          <div className="workflow-panel">
            <h3>Recent order events</h3>
            <DataTable
              columns={["Event", "Entity", "Actor", "Order", "Site", "Item", "Module", "When"]}
              rows={recentEvents.data.map((row: any) => [
                row.event_type,
                row.entity_type,
                row.actor_name,
                row.order_number,
                row.site_name,
                row.item_name_snapshot,
                row.source_module,
                new Date(row.created_at).toLocaleString("en-IN")
              ])}
            />
          </div>
        </QueryState>

        <QueryState
          loading={stuck.loading}
          error={stuck.error}
          hasData={stuck.data.length > 0}
          empty={{ title: "No stuck workflows", description: "Pending order items and orders will show here if they sit too long without movement." }}
        >
          <div className="workflow-panel">
            <h3>Stuck workflows</h3>
            <DataTable
              columns={["Entity", "Label", "Order", "Site", "Status", "Hours in state"]}
              rows={stuck.data.map((row: any) => [
                row.entity_type,
                row.entity_label,
                row.order_number,
                row.site_name,
                row.current_status,
                Math.round(Number(row.hours_in_state ?? 0))
              ])}
            />
          </div>
        </QueryState>

        <QueryState
          loading={actors.loading}
          error={actors.error}
          hasData={actors.data.length > 0}
          empty={{ title: "No actor history yet", description: "Once approvals and supply updates happen, the actor history table will populate here." }}
        >
          <div className="workflow-panel">
            <h3>Actor history</h3>
            <DataTable
              columns={["Actor", "Entity", "Events", "Last event"]}
              rows={actors.data.map((row: any) => [
                row.actor_name,
                row.entity_type,
                row.event_count,
                row.last_event_at ? new Date(row.last_event_at).toLocaleString("en-IN") : "-"
              ])}
            />
          </div>
        </QueryState>
      </div>
    </PageSection>
  );
}

export function OrderWorkflowTimeline({
  entityType,
  entityId,
  title = "Workflow timeline",
  description = "Every transition is now recorded in the workflow backbone."
}: {
  entityType: "order_item" | "site_order" | "substitute_suggestion";
  entityId: string | null;
  title?: string;
  description?: string;
}) {
  const timeline = useRows(
    async (client) => {
      if (!entityId) {
        return { data: [], error: null };
      }

      const { data, error } = await client
        .from("vw_order_workflow_timeline")
        .select("event_type, actor_name, current_step, step_status, notes, source_module, created_at, payload")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(20);

      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [entityType, entityId]
  );

  return (
    <PageSection title={title} description={description}>
      <QueryState
        loading={timeline.loading}
        error={timeline.error}
        hasData={timeline.data.length > 0}
        empty={{
          title: entityId ? "No timeline events yet" : "Pick an item to inspect",
          description: entityId
            ? "This entity does not have workflow event history yet."
            : "Select an order item or order to load its workflow timeline."
        }}
      >
        <div className="workflow-panel">
          <DataTable
            columns={["When", "Step", "Event", "Actor", "Status", "Module", "Notes"]}
            rows={timeline.data.map((row: any) => [
              new Date(row.created_at).toLocaleString("en-IN"),
              row.current_step,
              row.event_type,
              row.actor_name,
              row.step_status,
              row.source_module,
              row.notes ?? row.payload?.transition_key ?? "-"
            ])}
          />
        </div>
      </QueryState>
    </PageSection>
  );
}

export function AdminWorkflowHubPage() {
  const [selectedEntityType, setSelectedEntityType] = useState<"order_item" | "site_order" | "substitute_suggestion" | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  const recentEntities = useRows(
    async (client) => {
      const { data, error } = await client
        .from("vw_recent_order_workflow_events")
        .select("entity_type, entity_id, event_type, actor_name, order_number, site_name, item_name_snapshot, created_at")
        .order("created_at", { ascending: false })
        .limit(12);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const selectedMeta = useMemo(() => {
    if (!selectedEntityId || !selectedEntityType) return null;
    return recentEntities.data.find((row: any) => row.entity_id === selectedEntityId && row.entity_type === selectedEntityType) ?? null;
  }, [recentEntities.data, selectedEntityId, selectedEntityType]);

  return (
    <div className="page-stack">
      <AdminWorkflowMonitor />
      <PageSection
        title="Workflow inspection hub"
        description="Pick any recent order entity to inspect its event timeline without leaving the admin workflow center."
      >
        <QueryState
          loading={recentEntities.loading}
          error={recentEntities.error}
          hasData={recentEntities.data.length > 0}
          empty={{ title: "No recent workflow entities", description: "Run order approvals, substitute changes, or supply actions to populate this queue." }}
        >
          <div className="workflow-entity-grid">
            {recentEntities.data.map((row: any) => (
              <button
                key={`${row.entity_type}-${row.entity_id}-${row.created_at}`}
                type="button"
                className={`workflow-entity-card${selectedEntityId === row.entity_id && selectedEntityType === row.entity_type ? " is-selected" : ""}`}
                onClick={() => {
                  setSelectedEntityType(row.entity_type);
                  setSelectedEntityId(row.entity_id);
                }}
              >
                <span>{row.entity_type.replace("_", " ")}</span>
                <strong>{row.item_name_snapshot ?? row.order_number ?? row.entity_id}</strong>
                <p>{row.site_name ?? "Workflow entity"}</p>
                <small>
                  {row.event_type} · {row.actor_name ?? "System"} · {new Date(row.created_at).toLocaleString("en-IN")}
                </small>
              </button>
            ))}
          </div>
        </QueryState>
      </PageSection>
      <OrderWorkflowTimeline
        entityType={selectedEntityType ?? "order_item"}
        entityId={selectedEntityId}
        title={selectedMeta ? `Timeline for ${selectedMeta.item_name_snapshot ?? selectedMeta.order_number ?? selectedMeta.entity_type}` : "Workflow timeline"}
        description="This is the detailed event history for the entity selected above."
      />
    </div>
  );
}
