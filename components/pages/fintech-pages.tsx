"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/providers/auth-provider";
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
import { getSupabaseBrowserClient } from "@/lib/supabase";

function makeCode(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function makeSubscriptionNumber() {
  return `SAV-${Date.now().toString().slice(-8)}`;
}

function addDays(baseDate: Date, days: number) {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + days);
  return next;
}

export function CustomerWalletPage() {
  const { profile, activeTenant } = useAuth();
  const customerId = profile?.id ?? "";
  const tenantId = activeTenant?.id ?? "";

  const wallet = useRows(
    async (client) => {
      const { data, error } = await client
        .from("wallet_accounts")
        .select("*")
        .eq("user_id", customerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return { data: data ? [data as any] : [], error: error?.message ?? null };
    },
    [customerId, tenantId]
  );

  const ledger = useRows(
    async (client) => {
      if (!wallet.data[0]?.id) return { data: [] as any[], error: null };
      const { data, error } = await client
        .from("wallet_ledger_entries")
        .select("*")
        .eq("wallet_account_id", wallet.data[0].id)
        .order("created_at", { ascending: false })
        .limit(25);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [wallet.data[0]?.id]
  );

  const totalCredits = ledger.data
    .filter((row: any) => row.direction === "credit")
    .reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);
  const totalDebits = ledger.data
    .filter((row: any) => row.direction === "debit")
    .reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Available balance", value: `₹${Number(wallet.data[0]?.available_balance ?? 0).toLocaleString("en-IN")}` },
          { label: "Total credits", value: `₹${totalCredits.toLocaleString("en-IN")}` },
          { label: "Total debits", value: `₹${totalDebits.toLocaleString("en-IN")}` },
          { label: "Entries", value: ledger.data.length }
        ]}
      />
      <PageSection
        title="Wallet ledger"
        description="This is the customer-facing wallet view for rewards, savings credits, and future financing movements."
      >
        <QueryState
          loading={wallet.loading || ledger.loading}
          error={wallet.error || ledger.error}
          hasData={Boolean(wallet.data.length)}
          empty={{
            title: "Wallet not created yet",
            description: "Ask admin to run the fintech migration and create a wallet account for this customer."
          }}
        >
          <CardGrid>
            <DataCard
              title={activeTenant?.app_name ?? "Tenant wallet"}
              subtitle={profile?.full_name ?? "Customer"}
              meta={wallet.data[0]?.status ?? "inactive"}
            >
              <p>Currency: {wallet.data[0]?.currency_code ?? "INR"}</p>
              <p>Lifetime credited: ₹{Number(wallet.data[0]?.lifetime_credited ?? 0).toLocaleString("en-IN")}</p>
              <p>Lifetime debited: ₹{Number(wallet.data[0]?.lifetime_debited ?? 0).toLocaleString("en-IN")}</p>
            </DataCard>
          </CardGrid>
          <DataTable
            columns={["Date", "Direction", "Type", "Amount", "Status", "Narrative"]}
            rows={ledger.data.map((entry: any) => [
              new Date(entry.created_at).toLocaleString("en-IN"),
              entry.direction,
              entry.entry_type,
              `₹${Number(entry.amount ?? 0).toLocaleString("en-IN")}`,
              entry.status,
              entry.narrative ?? "-"
            ])}
          />
        </QueryState>
      </PageSection>
    </div>
  );
}

export function CustomerSavingsPage() {
  const { profile, activeTenant } = useAuth();
  const customerId = profile?.id ?? "";
  const tenantId = activeTenant?.id ?? "";
  const mutation = useMutationAction();
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [payingInstallmentId, setPayingInstallmentId] = useState("");

  const wallet = useRows(
    async (client) => {
      const { data, error } = await client
        .from("wallet_accounts")
        .select("id")
        .eq("user_id", customerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      return { data: data ? [data as any] : [], error: error?.message ?? null };
    },
    [customerId, tenantId]
  );

  const templates = useRows(
    async (client) => {
      const { data, error } = await client
        .from("savings_plan_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("installment_amount");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId]
  );

  const subscriptions = useRows(
    async (client) => {
      const { data, error } = await client
        .from("savings_plan_subscriptions")
        .select("*, plan_template:savings_plan_templates(name, code)")
        .eq("tenant_id", tenantId)
        .eq("user_id", customerId)
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId, customerId]
  );

  const installments = useRows(
    async (client) => {
      const subscriptionIds = subscriptions.data.map((subscription: any) => subscription.id);
      if (!subscriptionIds.length) return { data: [] as any[], error: null };
      const { data, error } = await client
        .from("savings_installments")
        .select("*")
        .in("subscription_id", subscriptionIds)
        .order("due_date", { ascending: true });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [subscriptions.data.map((subscription: any) => subscription.id).join(",")]
  );

  async function subscribeToPlan(template: any) {
    const client = await getSupabaseBrowserClient();
    if (!client || !customerId || !tenantId) return;
    setSelectedTemplateId(template.id);

    const walletAccountId = wallet.data[0]?.id;
    if (!walletAccountId) {
      mutation.reset();
      await mutation.run(async () => ({
        error: { message: "Wallet account not found for this tenant. Create wallet accounts first from admin fintech." }
      }));
      setSelectedTemplateId("");
      return;
    }

    const startDate = new Date();
    const subscriptionNumber = makeSubscriptionNumber();

    const ok = await mutation.run(async () => {
      const subscriptionPayload = {
        tenant_id: tenantId,
        wallet_account_id: walletAccountId,
        user_id: customerId,
        plan_template_id: template.id,
        subscription_number: subscriptionNumber,
        status: "active",
        started_at: startDate.toISOString().slice(0, 10),
        maturity_date: addDays(startDate, Number(template.frequency_days ?? 30) * Number(template.installment_count ?? 1))
          .toISOString()
          .slice(0, 10),
        installment_amount: Number(template.installment_amount ?? 0),
        installment_count: Number(template.installment_count ?? 0),
        maturity_bonus_amount: Number(template.maturity_bonus_amount ?? 0),
        created_by: customerId
      };

      const subscriptionResult = await client
        .from("savings_plan_subscriptions")
        .insert(subscriptionPayload)
        .select("id")
        .single();

      if (subscriptionResult.error || !subscriptionResult.data?.id) {
        return { error: subscriptionResult.error };
      }

      const rows = Array.from({ length: Number(template.installment_count ?? 0) }).map((_, index) => ({
        tenant_id: tenantId,
        subscription_id: subscriptionResult.data.id,
        installment_number: index + 1,
        due_date: addDays(startDate, Number(template.frequency_days ?? 30) * index).toISOString().slice(0, 10),
        expected_amount: Number(template.installment_amount ?? 0),
        status: "pending"
      }));

      return client.from("savings_installments").insert(rows);
    }, "Savings plan enrolled successfully.");

    if (ok) {
      subscriptions.refetch?.();
      installments.refetch?.();
    }
    setSelectedTemplateId("");
  }

  async function payInstallment(installmentId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client || !installmentId) return;
    setPayingInstallmentId(installmentId);

    const ok = await mutation.run(
      async () =>
        (client as any).rpc("pay_savings_installment", {
          target_installment_id: installmentId,
          payment_amount: null,
          note_text: "Customer installment payment recorded from the app."
        }),
      "Installment posted successfully."
    );

    if (ok) {
      wallet.refetch?.();
      subscriptions.refetch?.();
      installments.refetch?.();
    }

    setPayingInstallmentId("");
  }

  const nextPendingInstallment = installments.data.find((row: any) => row.status === "pending");

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Active subscriptions", value: subscriptions.data.filter((row: any) => row.status === "active").length },
          { label: "Installments tracked", value: installments.data.length },
          { label: "Next due", value: nextPendingInstallment?.due_date ?? "-" },
          { label: "Next amount", value: `₹${Number(nextPendingInstallment?.expected_amount ?? 0).toLocaleString("en-IN")}` }
        ]}
      />
      <PageSection
        title="Available savings plans"
        description="These plans can become your renovation savings engine before financing is launched."
      >
        <QueryState
          loading={templates.loading}
          error={templates.error}
          hasData={templates.data.length > 0}
          empty={{
            title: "No active savings plans",
            description: "Admin can create savings plan templates from the fintech control center."
          }}
        >
          <CardGrid>
            {templates.data.map((template: any) => (
              <DataCard
                key={template.id}
                title={template.name}
                subtitle={template.description}
                meta={`${template.installment_count} installments`}
              >
                <p>Installment: ₹{Number(template.installment_amount ?? 0).toLocaleString("en-IN")}</p>
                <p>Frequency: every {template.frequency_days} days</p>
                <p>Maturity bonus: ₹{Number(template.maturity_bonus_amount ?? 0).toLocaleString("en-IN")}</p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void subscribeToPlan(template)}
                    disabled={mutation.isSubmitting || selectedTemplateId === template.id}
                  >
                    {mutation.isSubmitting && selectedTemplateId === template.id ? "Joining..." : "Join plan"}
                  </button>
                </div>
              </DataCard>
            ))}
          </CardGrid>
          <FormNotice error={mutation.error} success={mutation.success} />
        </QueryState>
      </PageSection>
      <PageSection
        title="My subscriptions"
        description="Live subscriptions and installment schedules tracked against your wallet."
      >
        <QueryState
          loading={subscriptions.loading || installments.loading}
          error={subscriptions.error || installments.error}
          hasData={subscriptions.data.length > 0}
          empty={{
            title: "No savings subscriptions yet",
            description: "Join an active savings plan to start building installment history."
          }}
        >
          <CardGrid>
            {subscriptions.data.map((subscription: any) => (
              <DataCard
                key={subscription.id}
                title={subscription.plan_template?.name ?? subscription.subscription_number}
                subtitle={subscription.subscription_number}
                meta={subscription.status}
              >
                <p>Installment amount: ₹{Number(subscription.installment_amount ?? 0).toLocaleString("en-IN")}</p>
                <p>Count: {subscription.installment_count}</p>
                <p>Maturity date: {subscription.maturity_date ?? "-"}</p>
              </DataCard>
            ))}
          </CardGrid>
          <DataTable
            columns={["Subscription", "Installment", "Due date", "Expected", "Paid", "Status"]}
            rows={installments.data.map((row: any) => {
              const subscription = subscriptions.data.find((item: any) => item.id === row.subscription_id);
              return [
                subscription?.subscription_number ?? row.subscription_id,
                row.installment_number,
                row.due_date,
                `₹${Number(row.expected_amount ?? 0).toLocaleString("en-IN")}`,
                `₹${Number(row.paid_amount ?? 0).toLocaleString("en-IN")}`,
                row.status
              ];
            })}
          />
          <CardGrid>
            {installments.data
              .filter((row: any) => ["pending", "late"].includes(row.status))
              .map((row: any) => {
                const subscription = subscriptions.data.find((item: any) => item.id === row.subscription_id);
                return (
                  <DataCard
                    key={row.id}
                    title={`Installment ${row.installment_number}`}
                    subtitle={subscription?.subscription_number ?? row.subscription_id}
                    meta={row.status}
                  >
                    <p>Due date: {row.due_date}</p>
                    <p>Expected amount: ₹{Number(row.expected_amount ?? 0).toLocaleString("en-IN")}</p>
                    <p>Paid so far: ₹{Number(row.paid_amount ?? 0).toLocaleString("en-IN")}</p>
                    <div className="inline-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => void payInstallment(row.id)}
                        disabled={mutation.isSubmitting && payingInstallmentId === row.id}
                      >
                        {mutation.isSubmitting && payingInstallmentId === row.id ? "Posting..." : "Mark installment paid"}
                      </button>
                    </div>
                  </DataCard>
                );
              })}
          </CardGrid>
          <FormNotice error={mutation.error} success={mutation.success} />
        </QueryState>
      </PageSection>
    </div>
  );
}

export function CustomerReferralsPage() {
  const { profile, activeTenant } = useAuth();
  const customerId = profile?.id ?? "";
  const tenantId = activeTenant?.id ?? "";
  const mutation = useMutationAction();

  const codes = useRows(
    async (client) => {
      const { data, error } = await client
        .from("referral_codes")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("user_id", customerId)
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId, customerId]
  );

  const rewards = useRows(
    async (client) => {
      const { data, error } = await client
        .from("referral_rewards")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("beneficiary_user_id", customerId)
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId, customerId]
  );

  const events = useRows(
    async (client) => {
      const { data, error } = await client
        .from("referral_events")
        .select("*")
        .eq("tenant_id", tenantId)
        .or(`referrer_user_id.eq.${customerId},referred_user_id.eq.${customerId}`)
        .order("created_at", { ascending: false })
        .limit(25);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId, customerId]
  );

  async function createReferralCode() {
    const client = await getSupabaseBrowserClient();
    if (!client || !tenantId || !customerId) return;

    const ok = await mutation.run(
      async () =>
        client.from("referral_codes").insert({
          tenant_id: tenantId,
          user_id: customerId,
          code: makeCode("ME")
        }),
      "Referral code created."
    );

    if (ok) {
      codes.refetch?.();
    }
  }

  const totalEarned = rewards.data
    .filter((reward: any) => ["approved", "credited"].includes(reward.reward_status))
    .reduce((sum: number, reward: any) => sum + Number(reward.reward_amount ?? 0), 0);

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Referral codes", value: codes.data.length },
          { label: "Referral events", value: events.data.length },
          { label: "Reward records", value: rewards.data.length },
          { label: "Earned value", value: `₹${totalEarned.toLocaleString("en-IN")}` }
        ]}
      />
      <FormCard
        title="Referral wallet growth"
        description="Use this to drive acquisition into savings plans, the app, and later financing."
      >
        <div className="form-actions">
          <button className="primary-button" type="button" onClick={() => void createReferralCode()} disabled={mutation.isSubmitting}>
            {mutation.isSubmitting ? "Creating..." : "Create my referral code"}
          </button>
        </div>
        <FormNotice error={mutation.error} success={mutation.success} />
      </FormCard>
      <PageSection title="My referral codes" description="Share these codes with neighbors and customers.">
        <QueryState
          loading={codes.loading}
          error={codes.error}
          hasData={codes.data.length > 0}
          empty={{
            title: "No referral code yet",
            description: "Create one from the form above."
          }}
        >
          <CardGrid>
            {codes.data.map((code: any) => (
              <DataCard key={code.id} title={code.code} subtitle="Active referral code" meta={code.is_active ? "active" : "inactive"}>
                <p>Created: {new Date(code.created_at).toLocaleString("en-IN")}</p>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </PageSection>
      <PageSection title="Referral history" description="Reward and event trail for your customer growth loop.">
        <QueryState
          loading={events.loading || rewards.loading}
          error={events.error || rewards.error}
          hasData={events.data.length > 0 || rewards.data.length > 0}
          empty={{
            title: "No referral activity yet",
            description: "Referral events and rewards will appear here as the program runs."
          }}
        >
          <DataTable
            columns={["Type", "Reference", "Date", "Status / Amount"]}
            rows={[
              ...events.data.map((event: any) => [
                "Event",
                event.trigger_event,
                new Date(event.created_at).toLocaleString("en-IN"),
                event.reference_type ?? "-"
              ]),
              ...rewards.data.map((reward: any) => [
                "Reward",
                reward.referral_event_id,
                new Date(reward.created_at).toLocaleString("en-IN"),
                `${reward.reward_status} • ₹${Number(reward.reward_amount ?? 0).toLocaleString("en-IN")}`
              ])
            ]}
          />
        </QueryState>
      </PageSection>
    </div>
  );
}

export function AdminFintechPage() {
  const { profile, activeTenant } = useAuth();
  const adminId = profile?.id ?? "";
  const tenantId = activeTenant?.id ?? "";
  const planMutation = useMutationAction();
  const referralMutation = useMutationAction();
  const walletMutation = useMutationAction();
  const rewardMutation = useMutationAction();

  const [planForm, setPlanForm] = useState({
    code: "",
    name: "",
    description: "",
    installment_amount: "",
    installment_count: "12",
    frequency_days: "30",
    maturity_bonus_amount: "0",
    status: "active"
  });
  const [referralForm, setReferralForm] = useState({
    code: "",
    name: "",
    description: "",
    trigger_event: "first_savings_installment_paid",
    referrer_reward_amount: "100",
    referred_reward_amount: "50",
    reward_amount: "150",
    status: "active"
  });
  const [walletForm, setWalletForm] = useState({
    user_id: "",
    amount: "",
    direction: "credit",
    entry_type: "manual_adjustment",
    narrative: ""
  });

  const wallets = useRows(
    async (client) => {
      const { data, error } = await client
        .from("wallet_accounts")
        .select("id, user_id, available_balance, status, currency_code, users!inner(full_name, email)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId]
  );

  const users = useRows(
    async (client) => {
      const { data, error } = await client
        .from("tenant_memberships")
        .select("user_id, users!inner(id, full_name, email, role)")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId]
  );

  const plans = useRows(
    async (client) => {
      const { data, error } = await client
        .from("savings_plan_templates")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId]
  );

  const programs = useRows(
    async (client) => {
      const { data, error } = await client
        .from("referral_programs")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId]
  );

  const subscriptions = useRows(
    async (client) => {
      const { data, error } = await client
        .from("savings_plan_subscriptions")
        .select("id, subscription_number, status, installment_amount, installment_count, users!inner(full_name), savings_plan_templates!inner(name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(25);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId]
  );

  const pendingRewards = useRows(
    async (client) => {
      const { data, error } = await client
        .from("referral_rewards")
        .select("id, reward_amount, reward_status, decision_notes, created_at, beneficiary_user_id, referral_event_id")
        .eq("tenant_id", tenantId)
        .in("reward_status", ["pending", "approved"])
        .order("created_at", { ascending: false })
        .limit(25);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [tenantId]
  );

  const rewardUsers = useRows(
    async (client) => {
      const userIds = Array.from(new Set(pendingRewards.data.map((reward: any) => reward.beneficiary_user_id).filter(Boolean)));
      if (!userIds.length) return { data: [] as any[], error: null };
      const { data, error } = await client
        .from("users")
        .select("id, full_name, email, phone")
        .in("id", userIds);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [pendingRewards.data.map((reward: any) => reward.beneficiary_user_id).join(",")]
  );

  const rewardEvents = useRows(
    async (client) => {
      const eventIds = Array.from(new Set(pendingRewards.data.map((reward: any) => reward.referral_event_id).filter(Boolean)));
      if (!eventIds.length) return { data: [] as any[], error: null };
      const { data, error } = await client
        .from("referral_events")
        .select("id, trigger_event, referrer_user_id, referred_user_id, created_at")
        .in("id", eventIds);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [pendingRewards.data.map((reward: any) => reward.referral_event_id).join(",")]
  );

  async function createSavingsPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client || !tenantId || !adminId) return;
    const ok = await planMutation.run(
      async () =>
        client.from("savings_plan_templates").insert({
          tenant_id: tenantId,
          code: planForm.code || makeCode("PLAN"),
          name: planForm.name,
          description: planForm.description || null,
          installment_amount: Number(planForm.installment_amount || 0),
          installment_count: Number(planForm.installment_count || 0),
          frequency_days: Number(planForm.frequency_days || 30),
          maturity_bonus_amount: Number(planForm.maturity_bonus_amount || 0),
          status: planForm.status,
          created_by: adminId
        }),
      "Savings plan created."
    );
    if (ok) {
      setPlanForm({
        code: "",
        name: "",
        description: "",
        installment_amount: "",
        installment_count: "12",
        frequency_days: "30",
        maturity_bonus_amount: "0",
        status: "active"
      });
      plans.refetch?.();
    }
  }

  async function createReferralProgram(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client || !tenantId || !adminId) return;
    const ok = await referralMutation.run(
      async () =>
        client.from("referral_programs").insert({
          tenant_id: tenantId,
          code: referralForm.code || makeCode("REF"),
          name: referralForm.name,
          description: referralForm.description || null,
          trigger_event: referralForm.trigger_event,
          reward_amount: Number(referralForm.reward_amount || 0),
          referrer_reward_amount: Number(referralForm.referrer_reward_amount || 0),
          referred_reward_amount: Number(referralForm.referred_reward_amount || 0),
          status: referralForm.status,
          created_by: adminId
        }),
      "Referral program created."
    );
    if (ok) {
      setReferralForm({
        code: "",
        name: "",
        description: "",
        trigger_event: "first_savings_installment_paid",
        referrer_reward_amount: "100",
        referred_reward_amount: "50",
        reward_amount: "150",
        status: "active"
      });
      programs.refetch?.();
    }
  }

  async function postWalletAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = await getSupabaseBrowserClient();
    if (!client || !tenantId || !adminId) return;

    const selectedWallet = wallets.data.find((wallet: any) => wallet.user_id === walletForm.user_id);
    if (!selectedWallet?.id) {
      await walletMutation.run(async () => ({ error: { message: "Wallet account not found for selected user." } }));
      return;
    }

    const amount = Number(walletForm.amount || 0);

    const ok = await walletMutation.run(
      async () =>
        (client as any).rpc("post_wallet_entry", {
          target_tenant_id: tenantId,
          target_wallet_account_id: selectedWallet.id,
          target_direction: walletForm.direction,
          target_entry_type: walletForm.entry_type,
          target_amount: amount,
          target_narrative: walletForm.narrative || null,
          target_reference_type: null,
          target_reference_id: null,
          target_external_reference: null
        }),
      "Wallet adjustment posted."
    );

    if (ok) {
      setWalletForm({
        user_id: "",
        amount: "",
        direction: "credit",
        entry_type: "manual_adjustment",
        narrative: ""
      });
      wallets.refetch?.();
    }
  }

  async function createWalletAccount(userId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client || !tenantId) return;
    const ok = await walletMutation.run(
      async () => (client as any).rpc("ensure_wallet_account", { target_tenant_id: tenantId, target_user_id: userId }),
      "Wallet account created."
    );
    if (ok) {
      wallets.refetch?.();
    }
  }

  async function resolveReward(rewardId: string, approveReward: boolean) {
    const client = await getSupabaseBrowserClient();
    if (!client || !rewardId) return;

    const ok = await rewardMutation.run(
      async () =>
        (client as any).rpc("resolve_referral_reward", {
          target_reward_id: rewardId,
          approve_reward: approveReward,
          note_text: approveReward
            ? "Approved and credited from the admin fintech console."
            : "Rejected from the admin fintech console."
        }),
      approveReward ? "Reward approved and credited." : "Reward rejected."
    );

    if (ok) {
      wallets.refetch?.();
      pendingRewards.refetch?.();
      rewardUsers.refetch?.();
      rewardEvents.refetch?.();
    }
  }

  const totalWalletBalance = wallets.data.reduce(
    (sum: number, wallet: any) => sum + Number(wallet.available_balance ?? 0),
    0
  );
  const pendingRewardValue = pendingRewards.data.reduce(
    (sum: number, reward: any) => sum + Number(reward.reward_amount ?? 0),
    0
  );
  const rewardUserLookup = new Map(rewardUsers.data.map((user: any) => [user.id, user]));
  const rewardEventLookup = new Map(rewardEvents.data.map((event: any) => [event.id, event]));

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "Wallets", value: wallets.data.length },
          { label: "Wallet balance float", value: `₹${totalWalletBalance.toLocaleString("en-IN")}` },
          { label: "Savings plans", value: plans.data.length },
          { label: "Referral programs", value: programs.data.length },
          { label: "Pending rewards", value: pendingRewards.data.length },
          { label: "Pending reward value", value: `₹${pendingRewardValue.toLocaleString("en-IN")}` }
        ]}
      />
      <FormCard
        title="Create savings plan template"
        description="This is the control center for your 10-12 month store-value savings product."
      >
        <form onSubmit={createSavingsPlan} className="auth-form">
          <FormGrid>
            <label>
              Code
              <input value={planForm.code} onChange={(event) => setPlanForm((state) => ({ ...state, code: event.target.value }))} placeholder="Auto if blank" />
            </label>
            <label>
              Plan name
              <input value={planForm.name} onChange={(event) => setPlanForm((state) => ({ ...state, name: event.target.value }))} required />
            </label>
            <label>
              Installment amount
              <input type="number" value={planForm.installment_amount} onChange={(event) => setPlanForm((state) => ({ ...state, installment_amount: event.target.value }))} required />
            </label>
            <label>
              Installment count
              <input type="number" value={planForm.installment_count} onChange={(event) => setPlanForm((state) => ({ ...state, installment_count: event.target.value }))} required />
            </label>
            <label>
              Frequency days
              <input type="number" value={planForm.frequency_days} onChange={(event) => setPlanForm((state) => ({ ...state, frequency_days: event.target.value }))} required />
            </label>
            <label>
              Maturity bonus
              <input type="number" value={planForm.maturity_bonus_amount} onChange={(event) => setPlanForm((state) => ({ ...state, maturity_bonus_amount: event.target.value }))} />
            </label>
          </FormGrid>
          <label>
            Description
            <textarea value={planForm.description} onChange={(event) => setPlanForm((state) => ({ ...state, description: event.target.value }))} />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={planMutation.isSubmitting}>
              {planMutation.isSubmitting ? "Saving..." : "Create savings plan"}
            </button>
          </div>
          <FormNotice error={planMutation.error} success={planMutation.success} />
        </form>
      </FormCard>

      <FormCard
        title="Create referral program"
        description="This powers wallet credits for viral growth around savings and app adoption."
      >
        <form onSubmit={createReferralProgram} className="auth-form">
          <FormGrid>
            <label>
              Code
              <input value={referralForm.code} onChange={(event) => setReferralForm((state) => ({ ...state, code: event.target.value }))} placeholder="Auto if blank" />
            </label>
            <label>
              Program name
              <input value={referralForm.name} onChange={(event) => setReferralForm((state) => ({ ...state, name: event.target.value }))} required />
            </label>
            <label>
              Trigger event
              <input value={referralForm.trigger_event} onChange={(event) => setReferralForm((state) => ({ ...state, trigger_event: event.target.value }))} required />
            </label>
            <label>
              Referrer reward
              <input type="number" value={referralForm.referrer_reward_amount} onChange={(event) => setReferralForm((state) => ({ ...state, referrer_reward_amount: event.target.value }))} required />
            </label>
            <label>
              Referred reward
              <input type="number" value={referralForm.referred_reward_amount} onChange={(event) => setReferralForm((state) => ({ ...state, referred_reward_amount: event.target.value }))} required />
            </label>
            <label>
              Total reward budget
              <input type="number" value={referralForm.reward_amount} onChange={(event) => setReferralForm((state) => ({ ...state, reward_amount: event.target.value }))} required />
            </label>
          </FormGrid>
          <label>
            Description
            <textarea value={referralForm.description} onChange={(event) => setReferralForm((state) => ({ ...state, description: event.target.value }))} />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={referralMutation.isSubmitting}>
              {referralMutation.isSubmitting ? "Saving..." : "Create referral program"}
            </button>
          </div>
          <FormNotice error={referralMutation.error} success={referralMutation.success} />
        </form>
      </FormCard>

      <FormCard
        title="Manual wallet adjustment"
        description="Use this sparingly for launch operations, corrections, or manual reward credits."
      >
        <form onSubmit={postWalletAdjustment} className="auth-form">
          <FormGrid>
            <label>
              User wallet
              <select value={walletForm.user_id} onChange={(event) => setWalletForm((state) => ({ ...state, user_id: event.target.value }))} required>
                <option value="">Select user</option>
                {wallets.data.map((wallet: any) => (
                  <option key={wallet.id} value={wallet.user_id}>
                    {wallet.users?.full_name ?? wallet.user_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Direction
              <select value={walletForm.direction} onChange={(event) => setWalletForm((state) => ({ ...state, direction: event.target.value }))}>
                <option value="credit">Credit</option>
                <option value="debit">Debit</option>
              </select>
            </label>
            <label>
              Entry type
              <select value={walletForm.entry_type} onChange={(event) => setWalletForm((state) => ({ ...state, entry_type: event.target.value }))}>
                <option value="manual_adjustment">Manual adjustment</option>
                <option value="referral_reward">Referral reward</option>
                <option value="cashback_reward">Cashback reward</option>
                <option value="savings_bonus">Savings bonus</option>
              </select>
            </label>
            <label>
              Amount
              <input type="number" value={walletForm.amount} onChange={(event) => setWalletForm((state) => ({ ...state, amount: event.target.value }))} required />
            </label>
          </FormGrid>
          <label>
            Narrative
            <textarea value={walletForm.narrative} onChange={(event) => setWalletForm((state) => ({ ...state, narrative: event.target.value }))} />
          </label>
          <div className="form-actions">
            <button className="primary-button" disabled={walletMutation.isSubmitting}>
              {walletMutation.isSubmitting ? "Posting..." : "Post wallet entry"}
            </button>
          </div>
          <FormNotice error={walletMutation.error} success={walletMutation.success} />
        </form>
      </FormCard>

      <PageSection
        title="Referral reward approvals"
        description="This is the admin queue for growth credits before they hit customer wallets."
      >
        <QueryState
          loading={pendingRewards.loading || rewardUsers.loading || rewardEvents.loading}
          error={pendingRewards.error || rewardUsers.error || rewardEvents.error}
          hasData={pendingRewards.data.length > 0}
          empty={{
            title: "No pending referral rewards",
            description: "Rewards created by the referral engine will appear here for approval or rejection."
          }}
        >
          <CardGrid>
            {pendingRewards.data.map((reward: any) => {
              const beneficiary = rewardUserLookup.get(reward.beneficiary_user_id);
              const event = rewardEventLookup.get(reward.referral_event_id);
              return (
                <DataCard
                  key={reward.id}
                  title={beneficiary?.full_name ?? reward.beneficiary_user_id}
                  subtitle={beneficiary?.email ?? beneficiary?.phone ?? "Beneficiary"}
                  meta={reward.reward_status}
                >
                  <p>Reward amount: ₹{Number(reward.reward_amount ?? 0).toLocaleString("en-IN")}</p>
                  <p>Trigger: {event?.trigger_event ?? reward.referral_event_id}</p>
                  <p>Raised: {new Date(reward.created_at).toLocaleString("en-IN")}</p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void resolveReward(reward.id, true)}
                      disabled={rewardMutation.isSubmitting}
                    >
                      Approve & credit
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void resolveReward(reward.id, false)}
                      disabled={rewardMutation.isSubmitting}
                    >
                      Reject
                    </button>
                  </div>
                </DataCard>
              );
            })}
          </CardGrid>
          <FormNotice error={rewardMutation.error} success={rewardMutation.success} />
        </QueryState>
      </PageSection>

      <PageSection title="Fintech live tables" description="This gives operations visibility into the first live wallet, savings, and referral records.">
        <QueryState
          loading={wallets.loading || plans.loading || programs.loading || subscriptions.loading || pendingRewards.loading}
          error={wallets.error || plans.error || programs.error || subscriptions.error || pendingRewards.error}
          hasData={wallets.data.length > 0 || plans.data.length > 0 || programs.data.length > 0}
          empty={{
            title: "No fintech records yet",
            description: "Create wallets, savings plans, and referral programs to start operating the fintech layer."
          }}
        >
          <CardGrid>
            {users.data
              .filter((membership: any) => !wallets.data.some((wallet: any) => wallet.user_id === membership.user_id))
              .map((membership: any) => (
                <DataCard
                  key={`wallet-create-${membership.user_id}`}
                  title={membership.users?.full_name ?? membership.user_id}
                  subtitle={membership.users?.email ?? membership.users?.role ?? "tenant member"}
                  meta="wallet missing"
                >
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => void createWalletAccount(membership.user_id)}
                    >
                      Create wallet
                    </button>
                  </div>
                </DataCard>
              ))}
            {plans.data.map((plan: any) => (
              <DataCard key={plan.id} title={plan.name} subtitle={plan.code} meta={plan.status}>
                <p>₹{Number(plan.installment_amount ?? 0).toLocaleString("en-IN")} × {plan.installment_count}</p>
              </DataCard>
            ))}
            {programs.data.map((program: any) => (
              <DataCard key={program.id} title={program.name} subtitle={program.code} meta={program.status}>
                <p>Trigger: {program.trigger_event}</p>
                <p>Referrer reward: ₹{Number(program.referrer_reward_amount ?? 0).toLocaleString("en-IN")}</p>
              </DataCard>
            ))}
          </CardGrid>
          <DataTable
            columns={["Customer", "Subscription", "Plan", "Amount", "Count", "Status"]}
            rows={subscriptions.data.map((row: any) => [
              row.users?.full_name ?? "-",
              row.subscription_number,
              row.savings_plan_templates?.name ?? "-",
              `₹${Number(row.installment_amount ?? 0).toLocaleString("en-IN")}`,
              row.installment_count,
              row.status
            ])}
          />
        </QueryState>
      </PageSection>
    </div>
  );
}
