import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useMutationAction, useRows } from "@/components/app-state";
import { WorkflowTimelineCard } from "@/components/workflow";
import { AppButton, Card, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import {
  approveOrderItemByCustomer,
  respondToSubstitute
} from "@/lib/backend/workflow-gateway";

export function ApprovalsScreen() {
  const { profile } = useAuth();
  const mutation = useMutationAction();
  const [selectedOrderItemId, setSelectedOrderItemId] = useState<string | null>(null);

  const approvals = useRows(async (client) => {
    if (!profile?.id) {
      return { data: [] as any[], error: null };
    }
    const { data, error } = await client
      .from("vw_customer_items_on_approval")
      .select("*")
      .eq("customer_id", profile.id);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [profile?.id]);

  const suggestions = useRows(async (client) => {
    if (!profile?.id) {
      return { data: [] as any[], error: null };
    }
    const { data, error } = await client
      .from("substitute_suggestions")
      .select("id, original_order_item_id, suggested_product_id, status")
      .eq("customer_id", profile.id)
      .eq("status", "suggested");
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [profile?.id]);

  useEffect(() => {
    if (!selectedOrderItemId && approvals.data[0]?.order_item_id) {
      setSelectedOrderItemId(approvals.data[0].order_item_id);
    }
  }, [approvals.data, selectedOrderItemId]);

  async function respond(orderItemId: string, approve: boolean) {
    const suggestion = suggestions.data.find((item: any) => item.original_order_item_id === orderItemId);
    const ok = await mutation.run(
      async () => {
        if (suggestion) {
          return respondToSubstitute({
            suggestion_id: suggestion.id,
            accept_choice: approve
          });
        }
        return approveOrderItemByCustomer({
          target_order_item_id: orderItemId,
          approve,
          note_text: approve ? "Approved from mobile customer workflow" : "Rejected from mobile customer workflow"
        });
      },
      suggestion
        ? approve ? "Substitute accepted." : "Substitute rejected."
        : approve ? "Item approved." : "Item rejected."
    );

    if (ok) {
      setSelectedOrderItemId(orderItemId);
      approvals.refetch();
      suggestions.refetch();
    }
  }

  return (
    <ScreenShell
      title="Customer approvals"
      subtitle="Approve line items and substitute suggestions from the same workflow RPCs used by the web app."
      currentScreen="approvals"
      showBack
    >
      {mutation.success ? <Notice message={mutation.success} tone="success" /> : null}
      {mutation.error ? <Notice message={mutation.error} tone="error" /> : null}

      <SectionTitle title="Pending approval items" description="Tap approve or reject, then inspect the workflow timeline below." />
      <QueryState
        loading={approvals.loading}
        error={approvals.error}
        hasData={approvals.data.length > 0}
        empty="No approval items are waiting for this customer right now."
      >
        {approvals.data.map((item: any) => (
          <Card key={item.order_item_id} tone="soft">
            <Text style={{ fontSize: 18, fontWeight: "700" }}>{item.item_name_snapshot}</Text>
            <Text style={{ marginTop: 6 }}>{item.site_name}</Text>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text>Brand: {item.brand_name_snapshot ?? "-"}</Text>
              <Text>Quantity: {item.quantity_required ?? "-"}</Text>
              <Text>Status: {item.status}</Text>
            </View>
            <View style={{ marginTop: 14, gap: 10 }}>
              <AppButton label="Approve" icon="check" onPress={() => void respond(item.order_item_id, true)} disabled={mutation.loading} />
              <AppButton label="Reject" icon="x" kind="secondary" onPress={() => void respond(item.order_item_id, false)} disabled={mutation.loading} />
              <AppButton label="View timeline" icon="clock" kind="secondary" onPress={() => setSelectedOrderItemId(item.order_item_id)} />
            </View>
          </Card>
        ))}
      </QueryState>

      <WorkflowTimelineCard
        entityType="order_item"
        entityId={selectedOrderItemId}
        title="Selected approval timeline"
        description="See how the selected line moved through architect review, substitute handling, and customer approval."
      />
    </ScreenShell>
  );
}
