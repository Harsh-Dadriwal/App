import { Text, View } from "react-native";
import { useRows } from "@/components/app-state";
import { Card, QueryState, SectionTitle } from "@/components/ui";

export function WorkflowTimelineCard({
  entityType,
  entityId,
  title,
  description
}: {
  entityType: "order_item" | "site_order" | "substitute_suggestion";
  entityId: string | null;
  title: string;
  description?: string;
}) {
  const timeline = useRows(
    async (client) => {
      if (!entityId) {
        return { data: [] as any[], error: null };
      }

      const { data, error } = await client
        .from("vw_order_workflow_timeline")
        .select("event_type, actor_name, current_step, step_status, notes, source_module, created_at, payload")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(8);

      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [entityType, entityId]
  );

  return (
    <View>
      <SectionTitle
        title={title}
        description={description ?? "Every workflow change now lands in the shared system event timeline."}
      />
      <QueryState
        loading={timeline.loading}
        error={timeline.error}
        hasData={timeline.data.length > 0}
        empty={entityId ? "No workflow timeline yet for this item." : "Pick an order or item first to see its workflow timeline."}
      >
        {timeline.data.map((event: any) => (
          <Card key={`${event.created_at}-${event.event_type}`} tone="soft">
            <Text style={{ fontSize: 16, fontWeight: "800" }}>{event.current_step ?? event.event_type}</Text>
            <Text style={{ marginTop: 6 }}>
              {event.actor_name ?? "System"} · {event.step_status ?? "completed"}
            </Text>
            <Text style={{ marginTop: 6 }}>
              {new Date(event.created_at).toLocaleString("en-IN")}
            </Text>
            <Text style={{ marginTop: 8, lineHeight: 22 }}>
              {event.notes ?? event.payload?.transition_key ?? event.source_module}
            </Text>
          </Card>
        ))}
      </QueryState>
    </View>
  );
}
