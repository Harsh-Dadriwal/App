import { Text, View } from "react-native";
import { useRows } from "@/components/app-state";
import { Card, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { palette } from "@/lib/theme";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

function formatMoney(value: unknown) {
  return money.format(Number(value ?? 0));
}

function formatPoints(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-IN");
}

export function IncentivesScreen() {
  const { profile, activeTenant } = useAuth();
  const partnerId = profile?.id ?? "";
  const tenantId = activeTenant?.id ?? "";
  const currentYear = new Date().getFullYear();

  const progress = useRows(async (client) => {
    if (!partnerId || !tenantId) return { data: [] as any[], error: null };
    const { data, error } = await client
      .from("vw_partner_incentive_progress")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("partner_id", partnerId)
      .eq("business_year", currentYear);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [partnerId, tenantId, currentYear], { realtimeTable: "partner_business_summary", enabled: Boolean(partnerId && tenantId) });

  const ledger = useRows(async (client) => {
    if (!partnerId || !tenantId) return { data: [] as any[], error: null };
    const { data, error } = await client
      .from("partner_commission_ledger")
      .select("entry_type, commission_type, business_amount, commission_percent, commission_amount, points, description, posted_at")
      .eq("tenant_id", tenantId)
      .eq("partner_id", partnerId)
      .order("posted_at", { ascending: false })
      .limit(25);
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [partnerId, tenantId], { realtimeTable: "partner_commission_ledger", enabled: Boolean(partnerId && tenantId) });

  const summary = progress.data[0] as any | undefined;
  const nextTarget = Number(summary?.next_tier_min_business ?? summary?.total_business ?? 0);
  const total = Number(summary?.total_business ?? 0);
  const percent = nextTarget > 0 ? Math.min(100, Math.round((total / nextTarget) * 100)) : 100;

  return (
    <ScreenShell
      title="Partner incentives"
      subtitle="Track tier, yearly business, commission, points, rewards, and bonus history."
      currentScreen="incentives"
      showBack
    >
      <SectionTitle title="Current tier" description="Updates automatically when supplied orders are completed." />
      <QueryState loading={progress.loading} error={progress.error} hasData={Boolean(summary)} empty="No partner incentive activity yet. Completed partner-linked supplied orders will show here.">
        <Card tone="brand">
          <Text style={{ fontSize: 30, fontWeight: "900", color: summary?.current_tier_color ?? palette.brand }}>
            {summary?.current_tier ?? "Not started"}
          </Text>
          <Text style={{ color: palette.muted, marginTop: 4, fontWeight: "700" }}>{summary?.scheme_name ?? "Active scheme"}</Text>
          <View style={{ height: 10, backgroundColor: "rgba(15,23,42,0.08)", borderRadius: 999, overflow: "hidden", marginTop: 18 }}>
            <View style={{ width: `${percent}%`, height: "100%", backgroundColor: palette.brand, borderRadius: 999 }} />
          </View>
          <Text style={{ color: palette.ink, marginTop: 12, fontWeight: "700" }}>
            {summary?.next_tier ? `${formatMoney(summary.business_to_next_tier)} to ${summary.next_tier}` : "Top tier reached"}
          </Text>
        </Card>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Card tone="soft"><Text style={{ color: palette.muted }}>Business</Text><Text style={{ fontSize: 18, fontWeight: "900" }}>{formatMoney(summary?.total_business)}</Text></Card>
          <Card tone="soft"><Text style={{ color: palette.muted }}>Commission</Text><Text style={{ fontSize: 18, fontWeight: "900" }}>{formatMoney(summary?.commission_earned)}</Text></Card>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Card tone="soft"><Text style={{ color: palette.muted }}>Points</Text><Text style={{ fontSize: 18, fontWeight: "900" }}>{formatPoints(summary?.current_points)}</Text></Card>
          <Card tone="soft"><Text style={{ color: palette.muted }}>Wire / Other</Text><Text style={{ fontSize: 14, fontWeight: "900" }}>{formatMoney(summary?.wire_business)} / {formatMoney(summary?.other_business)}</Text></Card>
        </View>
      </QueryState>

      <View style={{ marginTop: 10 }}>
        <SectionTitle title="Transactions" description="Commission, bonus points, rewards, and adjustments." />
      </View>
      <QueryState loading={ledger.loading} error={ledger.error} hasData={ledger.data.length > 0} empty="No transactions yet.">
        {ledger.data.map((row: any, index) => (
          <Card key={`${row.posted_at}-${index}`} tone="soft">
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "800", color: palette.ink }}>{row.entry_type}</Text>
                <Text style={{ color: palette.muted, marginTop: 4 }}>{row.description ?? row.commission_type ?? "Partner incentive"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 16, fontWeight: "900", color: palette.brandDeep }}>{formatMoney(row.commission_amount)}</Text>
                <Text style={{ color: palette.muted, marginTop: 2 }}>{formatPoints(row.points)} pts</Text>
              </View>
            </View>
          </Card>
        ))}
      </QueryState>
    </ScreenShell>
  );
}
