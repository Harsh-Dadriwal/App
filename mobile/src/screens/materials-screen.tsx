import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutationAction, useRows } from "@/components/app-state";
import { WorkflowTimelineCard } from "@/components/workflow";
import { AppButton, Card, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { reviewOrderItemByArchitect } from "@/lib/backend/workflow-gateway";

export function MaterialsScreen() {
  const { profile } = useAuth();
  const mutation = useMutationAction();
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<string | null>(null);
  const source = profile?.role === "architect" ? "vw_architect_material_tracker" : "vw_electrician_material_tracker";
  const filterKey = profile?.role === "architect" ? "architect_id" : "electrician_id";
  const query = useRows(async (client) => {
    if (!profile?.id) {
      return { data: [] as any[], error: null };
    }
    const { data, error } = await client.from(source).select("*").eq(filterKey, profile.id);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [profile?.id, source, filterKey]);

  useEffect(() => {
    if (!selectedOrderItemId && query.data[0]?.order_item_id) {
      setSelectedOrderItemId(query.data[0].order_item_id);
    }
  }, [query.data, selectedOrderItemId]);

  async function reviewItem(orderItemId: string, approve: boolean) {
    const ok = await mutation.run(
      async () => reviewOrderItemByArchitect({
        target_order_item_id: orderItemId,
        approve,
        note_text: approve ? "Approved from mobile architect workflow" : "Rejected from mobile architect workflow"
      }),
      approve ? "Item approved by architect." : "Item rejected by architect."
    );
    if (ok) {
      setSelectedOrderItemId(orderItemId);
      query.refetch();
    }
  }

  return (
    <ScreenShell
      title="Material tracker"
      subtitle="Mobile view of live material requirements, approvals, and supply progress."
      currentScreen="materials"
      showBack
    >
      {mutation.success ? <Notice message={mutation.success} tone="success" /> : null}
      {mutation.error ? <Notice message={mutation.error} tone="error" /> : null}
      <SectionTitle title="Tracked items" description="Each card comes from the same tracker views used by the web app." />
      <QueryState loading={query.loading} error={query.error} hasData={query.data.length > 0} empty="No material lines are visible for this user yet.">
        {query.data.map((item: any) => (
          <Card key={item.order_item_id} tone="soft">
            <Text style={{ fontSize: 18, fontWeight: "700" }}>{item.item_name_snapshot}</Text>
            <Text style={{ marginTop: 6 }}>{item.site_name}</Text>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text>Status: {item.status}</Text>
              <Text>Required: {item.quantity_required}</Text>
              <Text>Supplied: {item.quantity_supplied}</Text>
              <Text>Pending customer: {item.in_customer_approval_pending ? "Yes" : "No"}</Text>
            </View>
            <View style={{ marginTop: 14, gap: 10 }}>
              {profile?.role === "architect" && item.status === "pending_architect_approval" ? (
                <>
                  <AppButton label="Approve" icon="check" onPress={() => void reviewItem(item.order_item_id, true)} disabled={mutation.loading} />
                  <AppButton label="Reject" icon="x" kind="secondary" onPress={() => void reviewItem(item.order_item_id, false)} disabled={mutation.loading} />
                </>
              ) : null}
              <AppButton label="View timeline" icon="clock" kind="secondary" onPress={() => setSelectedOrderItemId(item.order_item_id)} />
            </View>
          </Card>
        ))}
      </QueryState>
      <WorkflowTimelineCard
        entityType="order_item"
        entityId={selectedOrderItemId}
        title="Selected material timeline"
        description="Use this to inspect architect review, customer approval, substitute flow, and supply progress for one material line."
      />
    </ScreenShell>
  );
}
