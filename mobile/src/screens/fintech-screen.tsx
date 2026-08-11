import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useMutationAction, useRows } from "@/components/app-state";
import { AppButton, Card, Chip, Notice, QueryState, ScreenShell, SectionTitle } from "@/components/ui";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import { paySavingsInstallment } from "@/lib/backend/fintech-gateway";

import { palette } from "@/lib/theme";

export function FintechScreen() {
  const { profile, activeTenant } = useAuth();
  const mutation = useMutationAction();
  const [payingInstallmentId, setPayingInstallmentId] = useState("");
  const customerId = profile?.id ?? "";
  const tenantId = activeTenant?.id ?? "";

  // 1. Fetch Core Wallet Account
  const wallet = useRows(async (client) => {
    const { data, error } = await client
      .from("wallet_accounts")
      .select("*")
      .eq("user_id", customerId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    return { data: data ? [data as any] : [], error: error?.message ?? null };
  }, [customerId, tenantId], { realtimeTable: "wallet_accounts" });

  // 2. Fetch Contractor Credit Facility details
  const contractorCredit = useRows(async (client) => {
    const { data, error } = await client
      .from("contractors")
      .select("*")
      .eq("id", customerId)
      .maybeSingle();
    return { data: data ? [data as any] : [], error: error?.message ?? null };
  }, [customerId], { realtimeTable: "contractors" });

  // 3. Fetch Contractor Detailed Credit Profile
  const creditProfile = useRows(async (client) => {
    const { data, error } = await client
      .from("credit_profiles")
      .select("*")
      .eq("contractor_id", customerId)
      .maybeSingle();
    return { data: data ? [data as any] : [], error: error?.message ?? null };
  }, [customerId], { realtimeTable: "credit_profiles" });

  // 4. Fetch Outstanding Invoices
  const dueInvoices = useRows(async (client) => {
    const { data, error } = await client
      .from("invoices")
      .select("*, project:projects(name)")
      .eq("contractor_id", customerId)
      .not("payment_status", "eq", "paid")
      .order("due_date", { ascending: true });
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [customerId], { realtimeTable: "invoices" });

  // 5. Fetch Savings Plan Subscriptions
  const subscriptions = useRows(async (client) => {
    const { data, error } = await client
      .from("savings_plan_subscriptions")
      .select("*, plan_template:savings_plan_templates(name, code)")
      .eq("tenant_id", tenantId)
      .eq("user_id", customerId)
      .order("created_at", { ascending: false });
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [customerId, tenantId], { realtimeTable: "savings_plan_subscriptions" });

  // 6. Fetch Savings Plan Installments
  const installments = useRows(async (client) => {
    const subscriptionIds = subscriptions.data.map((sub: any) => sub.id);
    if (!subscriptionIds.length) return { data: [] as any[], error: null };
    const { data, error } = await client
      .from("savings_installments")
      .select("*")
      .in("subscription_id", subscriptionIds)
      .order("due_date", { ascending: true });
    return { data: (data ?? []) as any[], error: error?.message ?? null };
  }, [subscriptions.data.map((sub: any) => sub.id).join(",")], { realtimeTable: "savings_installments" });

  async function payInstallment(installmentId: string) {
    if (!installmentId) return;
    setPayingInstallmentId(installmentId);

    const ok = await mutation.run(async () =>
      paySavingsInstallment({
        target_installment_id: installmentId,
        payment_amount: null,
        note_text: "Customer installment payment recorded from Mobile App."
      }),
      "Installment processed successfully!"
    );

    if (ok) {
      wallet.refetch();
      subscriptions.refetch();
      installments.refetch();
    }
    setPayingInstallmentId("");
  }

  const walletData = wallet.data[0];
  const creditData = contractorCredit.data[0];
  const profileData = creditProfile.data[0];

  // Dynamic status styling
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "green":
        return palette.success ?? "#16a34a";
      case "yellow":
        return "#ca8a04";
      case "orange":
        return "#ea580c";
      case "red":
      default:
        return palette.danger ?? "#dc2626";
    }
  };

  // Credit utilization percentage
  const creditLimit = Number(creditData?.credit_limit || 0);
  const availableCredit = Number(creditData?.available_credit || 0);
  const outstandingAmount = Number(profileData?.outstanding_amount || 0);
  const utilizationPercent = creditLimit > 0 ? Math.round((outstandingAmount / creditLimit) * 100) : 0;

  return (
    <ScreenShell
      title="Fintech Hub"
      subtitle="Manage your wallet, savings, and active credit facilities."
      currentScreen="fintech"
    >
      
      {/* SECTION A: CONTRACTOR CREDIT LINE (IF EXISTS) */}
      {creditData ? (
        <View style={{ marginBottom: 10 }}>
          <SectionTitle title="Contractor Credit Line" />
          <Card tone="default">
            
            {/* Frozen warning banner */}
            {creditData.is_frozen ? (
              <View style={{ backgroundColor: "#fee2e2", borderLeftWidth: 4, borderColor: "#ef4444", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                <Text style={{ color: "#991b1b", fontWeight: "800", fontSize: 13, textTransform: "uppercase" }}>
                  Facility Frozen
                </Text>
                <Text style={{ color: "#7f1d1d", fontSize: 12, marginTop: 2, fontWeight: "500" }}>
                  Your credit limit is frozen. Settle outstanding overdue invoices to reactivate.
                </Text>
              </View>
            ) : null}

            {/* Score & Status Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: "700", color: palette.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Credit Status
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: getStatusColor(creditData.credit_status) }} />
                  <Text style={{ fontSize: 16, fontWeight: "800", color: getStatusColor(creditData.credit_status), textTransform: "uppercase" }}>
                    {creditData.credit_status}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: palette.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Risk Score
                </Text>
                <Text style={{ fontSize: 18, fontWeight: "900", color: palette.ink, marginTop: 2 }}>
                  {creditData.risk_score} <Text style={{ fontSize: 13, color: palette.muted, fontWeight: "500" }}>/100</Text>
                </Text>
              </View>
            </View>

            {/* Balances */}
            <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: palette.line, paddingTop: 16 }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: "700", color: palette.muted, textTransform: "uppercase" }}>Available Credit</Text>
                <Text style={{ fontSize: 24, fontWeight: "900", color: "#16a34a", marginTop: 2 }}>
                  ₹{availableCredit.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: palette.muted, textTransform: "uppercase" }}>Credit Limit</Text>
                <Text style={{ fontSize: 24, fontWeight: "900", color: palette.ink, marginTop: 2 }}>
                  ₹{creditLimit.toLocaleString("en-IN")}
                </Text>
              </View>
            </View>

            {/* Utilization progress bar */}
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: palette.muted }}>Limit Utilization</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: palette.ink }}>{utilizationPercent}% Used</Text>
              </View>
              <View style={{ height: 6, backgroundColor: palette.line, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${Math.min(100, utilizationPercent)}%`, backgroundColor: palette.brand }} />
              </View>
            </View>

            <View style={{ marginTop: 16, flexDirection: "row", justifyContent: "space-between", fontSize: 12, gap: 10 }}>
              <Text style={{ fontSize: 12, color: palette.muted, fontWeight: "600" }}>Outstanding: ₹{outstandingAmount.toLocaleString("en-IN")}</Text>
              <Text style={{ fontSize: 12, color: palette.muted, fontWeight: "600" }}>Term: {creditData.credit_status === "green" ? "30 Days" : creditData.credit_status === "yellow" ? "15 Days" : "Project Linked"}</Text>
            </View>
          </Card>
        </View>
      ) : null}

      {/* SECTION B: OUTSTANDING INVOICES */}
      {creditData && dueInvoices.data.length > 0 ? (
        <View style={{ marginBottom: 10 }}>
          <SectionTitle title="Outstanding Invoices" />
          <QueryState
            loading={dueInvoices.loading}
            error={dueInvoices.error}
            hasData={dueInvoices.data.length > 0}
            empty="No unpaid invoices."
          >
            {dueInvoices.data.map((inv: any) => {
              const isOverdue = new Date(inv.due_date) < now;
              return (
                <Card key={inv.id} tone={isOverdue ? "danger" : "default"}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: palette.ink }}>
                        Invoice #{inv.id.slice(0, 8).toUpperCase()}
                      </Text>
                      <Text style={{ fontSize: 12, color: palette.muted, marginTop: 2, fontWeight: "600" }}>
                        Project: {inv.project?.name ?? "Linked project"}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: isOverdue ? palette.danger : palette.ink }}>
                      ₹{Number(inv.invoice_amount).toLocaleString("en-IN")}
                    </Text>
                  </View>

                  <View style={{ marginTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ fontSize: 12, color: isOverdue ? palette.danger : palette.muted, fontWeight: "700" }}>
                      {isOverdue ? "OVERDUE SINCE:" : "DUE DATE:"} {new Date(inv.due_date).toLocaleDateString("en-IN")}
                    </Text>
                    {inv.days_late > 0 ? (
                      <Text style={{ fontSize: 12, color: palette.danger, fontWeight: "800" }}>
                        {inv.days_late} days late
                      </Text>
                    ) : (
                      <Text style={{ fontSize: 12, color: "#16a34a", fontWeight: "700" }}>
                        Within Terms
                      </Text>
                    )}
                  </View>
                </Card>
              );
            })}
          </QueryState>
        </View>
      ) : null}

      {/* SECTION C: CORE WALLET */}
      <SectionTitle title="Core Wallet" />
      <QueryState
        loading={wallet.loading}
        error={wallet.error}
        hasData={wallet.data.length > 0}
        empty="Your fintech account hasn't been created yet. Ask your admin to run the migration setup."
      >
        <Card tone="brand">
          <Text style={{ fontSize: 32, fontWeight: "900", color: palette.brand, letterSpacing: -0.5 }}>
            ₹{Number(walletData?.available_balance ?? 0).toLocaleString("en-IN")}
          </Text>
          <Text style={{ marginTop: 2, color: palette.muted, fontWeight: "700", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Available Balance
          </Text>
          <View style={{ marginTop: 16, borderTopWidth: 1, borderColor: "rgba(15,23,42,0.06)", paddingTop: 16, gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>Status:</Text>
              <Text style={{ fontWeight: "800", color: palette.ink }}>{walletData?.status?.toUpperCase() ?? "INACTIVE"}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>Total Credited:</Text>
              <Text style={{ color: palette.ink, fontSize: 13, fontWeight: "700" }}>₹{Number(walletData?.lifetime_credited ?? 0).toLocaleString("en-IN")}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: "600" }}>Total Debited:</Text>
              <Text style={{ color: palette.ink, fontSize: 13, fontWeight: "700" }}>₹{Number(walletData?.lifetime_debited ?? 0).toLocaleString("en-IN")}</Text>
            </View>
          </View>
        </Card>
      </QueryState>

      <View style={{ marginTop: 8 }}>
        <SectionTitle title="Savings Subscriptions" />
      </View>
      <QueryState
        loading={subscriptions.loading}
        error={subscriptions.error}
        hasData={subscriptions.data.length > 0}
        empty="You are not subscribed to any savings plans yet. View available modules on the web app."
      >
        {subscriptions.data.map((sub: any) => (
          <Card key={sub.id} tone="soft">
            <Text style={{ fontSize: 18, fontWeight: "800", color: palette.ink, letterSpacing: -0.3 }}>
              {sub.plan_template?.name ?? sub.subscription_number}
            </Text>
            <Text style={{ fontSize: 13, color: palette.muted, marginTop: 4, fontWeight: "500" }}>
              ID: {sub.subscription_number}
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
              <Chip label={sub.status} onPress={() => {}} active={sub.status === 'active'} />
              <Chip label={`${sub.installment_count} Installments`} onPress={() => {}} />
            </View>
            <View style={{ marginTop: 16, backgroundColor: palette.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: palette.line }}>
               <Text style={{ color: palette.muted, fontSize: 12, fontWeight: "600", textTransform: "uppercase" }}>Commitment</Text>
               <Text style={{ color: palette.ink, fontSize: 16, fontWeight: "800", marginTop: 2 }}>
                 ₹{Number(sub.installment_amount ?? 0).toLocaleString("en-IN")} <Text style={{ fontSize: 12, fontWeight: "600", color: palette.muted }}>/payment</Text>
               </Text>
            </View>
          </Card>
        ))}
      </QueryState>

      <View style={{ marginTop: 8 }}>
        <SectionTitle title="Pending Installments" />
      </View>
      <QueryState
        loading={installments.loading}
        error={installments.error}
        hasData={installments.data.filter((i: any) => i.status === "pending" || i.status === "late").length > 0}
        empty="You're all caught up! No pending installments right now."
      >
        {installments.data
          .filter((i: any) => i.status === "pending" || i.status === "late")
          .map((installment: any) => {
            const sub = subscriptions.data.find((s: any) => s.id === installment.subscription_id);
            const isPaying = mutation.loading && payingInstallmentId === installment.id;
            const isLate = installment.status === "late";
            
            return (
              <Card key={installment.id} tone="default">
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: "800", color: palette.ink }}>
                      Installment #{installment.installment_number}
                    </Text>
                    <Text style={{ fontSize: 13, color: palette.muted, marginTop: 4, fontWeight: "500" }}>
                      {sub?.subscription_number ?? "Unknown Subscription"}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: "900", color: palette.brandDeep }}>
                    ₹{Number(installment.expected_amount ?? 0).toLocaleString("en-IN")}
                  </Text>
                </View>

                <View style={{ marginTop: 16, backgroundColor: isLate ? palette.danger + "15" : palette.surfaceSoft, padding: 12, borderRadius: 12 }}>
                  <Text style={{ color: isLate ? palette.danger : palette.ink, fontWeight: "700", fontSize: 13 }}>
                    {isLate ? "LATE PAYMENT DUE" : "PAYMENT DUE"}
                  </Text>
                  <Text style={{ color: palette.ink, fontWeight: "800", fontSize: 15, marginTop: 4 }}>
                    {new Date(installment.due_date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                  </Text>
                </View>
                
                <View style={{ marginTop: 16 }}>
                  <AppButton
                    label={isPaying ? "Processing Verification..." : "Pay Installment Now"}
                    icon="credit-card"
                    onPress={() => void payInstallment(installment.id)}
                    disabled={mutation.loading}
                  />
                </View>
              </Card>
            );
          })}
      </QueryState>
      
      {mutation.error ? <Notice message={mutation.error} tone="error" /> : null}
      {mutation.success ? <Notice message={mutation.success} tone="success" /> : null}

    </ScreenShell>
  );
}
