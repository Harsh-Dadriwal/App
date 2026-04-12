import { Text, View } from "react-native";
import { useRows } from "@/components/app-state";
import { Card, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";

export function MaterialsScreen() {
  const { profile } = useAuth();
  const source = profile?.role === "architect" ? "vw_architect_material_tracker" : "vw_electrician_material_tracker";
  const filterKey = profile?.role === "architect" ? "architect_id" : "electrician_id";
  const query = useRows(async (client) => {
    if (!profile?.id) {
      return { data: [] as any[], error: null };
    }
    const { data, error } = await client.from(source).select("*").eq(filterKey, profile.id);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [profile?.id, source, filterKey]);

  return (
    <ScreenShell
      title="Material tracker"
      subtitle="Mobile view of live material requirements, approvals, and supply progress."
      currentScreen="materials"
      showBack
    >
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
          </Card>
        ))}
      </QueryState>
    </ScreenShell>
  );
}
