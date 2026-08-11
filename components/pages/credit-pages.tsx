"use client";

import { useState } from "react";
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
import {
  recalculateCredit,
  getCreditProfile,
  getCreditHistory,
  manualCreditReview,
  getCreditDashboard
} from "@/lib/backend/modules/credit-gateway";

export function AdminCreditPage() {
  const [selectedContractorId, setSelectedContractorId] = useState<string | null>(null);

  if (selectedContractorId) {
    return (
      <ContractorCreditDetail
        contractorId={selectedContractorId}
        onBack={() => setSelectedContractorId(null)}
      />
    );
  }

  return <AdminCreditDashboard onSelectContractor={setSelectedContractorId} />;
}

// ----------------------------------------------------
// 1. ADMIN CREDIT DASHBOARD
// ----------------------------------------------------
type DashboardProps = {
  onSelectContractor: (id: string) => void;
};

function AdminCreditDashboard({ onSelectContractor }: DashboardProps) {
  const mutation = useMutationAction();

  // Fetch Dashboard Stats from Backend API
  const dashboardStats = useRows(async () => {
    const res = await getCreditDashboard();
    return {
      data: res.data ? [res.data] : [],
      error: res.error || null
    };
  }, []);

  // Fetch Contractors List from DB
  const contractorsList = useRows(async (client) => {
    const { data, error } = await client
      .from("contractors")
      .select(`
        id,
        credit_limit,
        available_credit,
        risk_score,
        credit_status,
        is_frozen,
        last_credit_review,
        user:users!id(full_name, email, role)
      `)
      .order("risk_score", { ascending: false });

    return {
      data: (data ?? []) as any[],
      error: error?.message ?? null
    };
  }, [], { realtimeTable: "contractors" });

  async function handleRecalculateAll() {
    await mutation.run(
      async () => {
        // Trigger for all contractors
        const promises = contractorsList.data.map((c) => recalculateCredit(c.id));
        await Promise.all(promises);
      },
      "Recalculated credit parameters for all contractors."
    );
    contractorsList.refetch?.();
    dashboardStats.refetch?.();
  }

  async function handleRecalculateSingle(contractorId: string) {
    await mutation.run(
      async () => recalculateCredit(contractorId),
      "Recalculated contractor credit limits."
    );
    contractorsList.refetch?.();
    dashboardStats.refetch?.();
  }

  const stats = dashboardStats.data[0] || {
    totalExposure: 0,
    overdueExposure: 0,
    creditUtilization: 0,
    frozenAccounts: 0,
    expectedCollections: 0,
    riskCategoryCount: { green: 0, yellow: 0, orange: 0, red: 0 }
  };

  return (
    <div className="space-y-8">
      <PageSection
        title="Credit Portfolio Performance"
        description="Dynamic constructing metrics tracking total exposure, risk ratings, and collection forecast."
      >
        <StatsGrid
          stats={[
            {
              label: "Total Credit Exposure",
              value: `₹${Number(stats.totalExposure).toLocaleString("en-IN")}`
            },
            {
              label: "Overdue Exposure",
              value: `₹${Number(stats.overdueExposure).toLocaleString("en-IN")}`,
              tone: stats.overdueExposure > 0 ? "critical" : "neutral"
            },
            {
              label: "Portfolio Utilization",
              value: `${stats.creditUtilization}%`
            },
            {
              label: "Collections (30d)",
              value: `₹${Number(stats.expectedCollections).toLocaleString("en-IN")}`
            },
            {
              label: "Frozen Accounts",
              value: stats.frozenAccounts,
              tone: stats.frozenAccounts > 0 ? "critical" : "neutral"
            }
          ]}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-xl border bg-green-50 dark:bg-green-900/20 border-green-200 text-center">
            <span className="block text-sm text-green-700 dark:text-green-300 font-bold uppercase">Green Status</span>
            <span className="text-3xl font-extrabold text-green-900 dark:text-green-100">{stats.riskCategoryCount.green}</span>
          </div>
          <div className="p-4 rounded-xl border bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 text-center">
            <span className="block text-sm text-yellow-700 dark:text-yellow-300 font-bold uppercase">Yellow Status</span>
            <span className="text-3xl font-extrabold text-yellow-900 dark:text-yellow-100">{stats.riskCategoryCount.yellow}</span>
          </div>
          <div className="p-4 rounded-xl border bg-orange-50 dark:bg-orange-900/20 border-orange-200 text-center">
            <span className="block text-sm text-orange-700 dark:text-orange-300 font-bold uppercase">Orange Status</span>
            <span className="text-3xl font-extrabold text-orange-900 dark:text-orange-100">{stats.riskCategoryCount.orange}</span>
          </div>
          <div className="p-4 rounded-xl border bg-red-50 dark:bg-red-900/20 border-red-200 text-center">
            <span className="block text-sm text-red-700 dark:text-red-300 font-bold uppercase">Red / Frozen</span>
            <span className="text-3xl font-extrabold text-red-900 dark:text-red-100">{stats.riskCategoryCount.red}</span>
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Contractors Credit Directory"
        description="Real-time monitoring of limits, risk profiles, and payment behaviors. Click a contractor to adjust limits or view timelines."
      >
        <div className="flex justify-end mb-4">
          <button
            type="button"
            className="primary-button flex items-center gap-2"
            onClick={() => void handleRecalculateAll()}
            disabled={mutation.isSubmitting}
          >
            Trigger Bulk Recalculation
          </button>
        </div>

        <QueryState
          loading={contractorsList.loading}
          error={contractorsList.error}
          hasData={contractorsList.data.length > 0}
          empty={{
            title: "No contractors registered",
            description: "Accounts registered as customer or electrician will appear here for credit scoring."
          }}
        >
          <DataTable
            columns={["Contractor", "Credit Limit", "Available Credit", "Risk Score", "Status", "Freeze State", "Actions"]}
            rows={contractorsList.data.map((c: any) => {
              const u = c.user || {};
              const badgeClass =
                c.credit_status === "green"
                  ? "bg-green-100 text-green-800 border-green-300"
                  : c.credit_status === "yellow"
                  ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                  : c.credit_status === "orange"
                  ? "bg-orange-100 text-orange-800 border-orange-300"
                  : "bg-red-100 text-red-800 border-red-300";

              return [
                <div key={c.id} className="font-medium text-slate-800 dark:text-slate-200">
                  <p>{u.full_name || "Name unspecified"}</p>
                  <p className="text-xs text-slate-500 font-mono">{u.email}</p>
                </div>,
                `₹${Number(c.credit_limit).toLocaleString("en-IN")}`,
                `₹${Number(c.available_credit).toLocaleString("en-IN")}`,
                <div key={`${c.id}-score`} className="font-extrabold text-slate-800 dark:text-slate-100">
                  {c.risk_score} / 100
                </div>,
                <span key={`${c.id}-badge`} className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeClass}`}>
                  {c.credit_status?.toUpperCase()}
                </span>,
                c.is_frozen ? (
                  <span key={`${c.id}-frozen`} className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs font-semibold">
                    FROZEN
                  </span>
                ) : (
                  <span key={`${c.id}-active`} className="text-xs text-green-700 font-semibold">
                    ACTIVE
                  </span>
                ),
                <div key={`${c.id}-actions`} className="flex gap-2">
                  <button
                    type="button"
                    className="secondary-button text-xs py-1"
                    onClick={() => onSelectContractor(c.id)}
                  >
                    View Details
                  </button>
                  <button
                    type="button"
                    className="secondary-button text-xs py-1 text-slate-600 border-slate-300 hover:border-slate-400"
                    onClick={() => void handleRecalculateSingle(c.id)}
                    disabled={mutation.isSubmitting}
                  >
                    Recalculate
                  </button>
                </div>
              ];
            })}
          />
        </QueryState>
        <FormNotice error={mutation.error} success={mutation.success} />
      </PageSection>
    </div>
  );
}

// ----------------------------------------------------
// 2. CONTRACTOR CREDIT DETAIL PAGE
// ----------------------------------------------------
type DetailProps = {
  contractorId: string;
  onBack: () => void;
};

function ContractorCreditDetail({ contractorId, onBack }: DetailProps) {
  const mutation = useMutationAction();

  // Override State
  const [overrideAction, setOverrideAction] = useState<"increase_limit" | "decrease_limit" | "freeze_credit" | "unfreeze_credit">("increase_limit");
  const [overrideAmount, setOverrideAmount] = useState<string>("");
  const [overrideNotes, setOverrideNotes] = useState<string>("");

  // 1. Fetch profile metrics
  const creditProfile = useRows(async () => {
    const res = await getCreditProfile(contractorId);
    return {
      data: res.data ? [res.data] : [],
      error: res.error || null
    };
  }, [contractorId]);

  // 2. Fetch credit score audit history
  const scoreHistory = useRows(async () => {
    const res = await getCreditHistory(contractorId);
    return {
      data: (res.data ?? []) as any[],
      error: res.error || null
    };
  }, [contractorId]);

  // 3. Fetch active projects
  const activeProjects = useRows(async (client) => {
    const { data, error } = await client
      .from("projects")
      .select("id, name, project_value, project_stage, credit_allocated, credit_used")
      .or(`customer_id.eq.${contractorId},created_by.eq.${contractorId}`);
    return {
      data: (data ?? []) as any[],
      error: error?.message ?? null
    };
  }, [contractorId]);

  // 4. Fetch invoices (for aging calculations)
  const invoicesList = useRows(async (client) => {
    const { data, error } = await client
      .from("invoices")
      .select("id, invoice_amount, due_date, payment_date, payment_status, days_late, project:projects(name)")
      .eq("contractor_id", contractorId)
      .order("created_at", { ascending: false });
    return {
      data: (data ?? []) as any[],
      error: error?.message ?? null
    };
  }, [contractorId]);

  async function handleRecalculate() {
    await mutation.run(
      async () => recalculateCredit(contractorId),
      "Credit parameters recalculated successfully."
    );
    creditProfile.refetch?.();
    scoreHistory.refetch?.();
    invoicesList.refetch?.();
  }

  async function handleOverride(e: FormEvent) {
    e.preventDefault();
    if (["increase_limit", "decrease_limit"].includes(overrideAction) && !overrideAmount) {
      alert("Please provide an adjustment amount.");
      return;
    }

    await mutation.run(
      async () =>
        manualCreditReview({
          contractorId,
          action: overrideAction,
          amount: overrideAmount ? Number(overrideAmount) : undefined,
          notes: overrideNotes
        }),
      "Manual credit override applied successfully."
    );
    // Reset form
    setOverrideAmount("");
    setOverrideNotes("");
    // Refetch
    creditProfile.refetch?.();
    scoreHistory.refetch?.();
  }

  const contractor = creditProfile.data[0];
  const profile = contractor?.profile || {};
  const { user = {} } = contractor || {};

  // Calculate Invoice Aging Buckets
  const now = new Date();
  const agingBuckets = {
    current: 0,
    "16-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0
  };

  invoicesList.data.forEach((inv) => {
    if (inv.payment_status !== "paid") {
      const dueDate = new Date(inv.due_date);
      const amt = Number(inv.invoice_amount || 0);
      if (dueDate >= now) {
        agingBuckets.current += amt;
      } else {
        const delayDays = Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));
        if (delayDays <= 15) {
          agingBuckets.current += amt; // 0-15 days overdue is categorized with current exposure
        } else if (delayDays <= 30) {
          agingBuckets["16-30"] += amt;
        } else if (delayDays <= 60) {
          agingBuckets["31-60"] += amt;
        } else if (delayDays <= 90) {
          agingBuckets["61-90"] += amt;
        } else {
          agingBuckets["90+"] += amt;
        }
      }
    }
  });

  // Calculate rule-based predicted risk category
  const utilization = contractor?.credit_limit > 0 ? profile.outstanding_amount / contractor.credit_limit : 0;
  const overdueCount = invoicesList.data.filter(i => i.payment_status !== "paid" && new Date(i.due_date) < now).length;
  
  let predictedRisk: "low risk" | "medium risk" | "high risk" | "default risk" = "low risk";
  if (overdueCount > 0 && profile.average_payment_delay_days > 30) {
    predictedRisk = "default risk";
  } else if (profile.late_payment_count > 2 || profile.average_payment_delay_days > 15) {
    predictedRisk = "high risk";
  } else if (utilization > 0.8 || profile.average_payment_delay_days > 7) {
    predictedRisk = "medium risk";
  }

  const predictedRiskColor =
    predictedRisk === "low risk"
      ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20"
      : predictedRisk === "medium risk"
      ? "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/20"
      : predictedRisk === "high risk"
      ? "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20"
      : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20";

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-900 border p-6 rounded-2xl">
        <div>
          <button type="button" className="text-sm font-semibold text-slate-500 hover:text-slate-800 mb-2 flex items-center gap-1" onClick={onBack}>
            &larr; Back to Credit Dashboard
          </button>
          <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {user.full_name || "Loading..."}
          </h2>
          <p className="text-slate-500 text-sm font-mono mt-1">{user.email}</p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void handleRecalculate()}
            disabled={mutation.isSubmitting || creditProfile.loading}
          >
            Force Recalculation
          </button>
        </div>
      </div>

      <QueryState loading={creditProfile.loading} error={creditProfile.error} hasData={!!contractor}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Main Scoring Card */}
          <div className="md:col-span-2 space-y-6">
            
            {/* Overview Limit Statistics */}
            <div className="p-6 rounded-2xl border bg-white dark:bg-slate-950 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4">
                <span className={`px-4 py-1.5 rounded-full text-xs font-black border uppercase ${
                  contractor?.credit_status === "green"
                    ? "bg-green-100 text-green-800 border-green-300"
                    : contractor?.credit_status === "yellow"
                    ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                    : contractor?.credit_status === "orange"
                    ? "bg-orange-100 text-orange-800 border-orange-300"
                    : "bg-red-100 text-red-800 border-red-300"
                }`}>
                  {contractor?.credit_status} Rating
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Credit Limit</span>
                  <span className="text-3xl font-black text-slate-950 dark:text-slate-50 mt-1 block">
                    ₹{Number(contractor?.credit_limit || 0).toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Available Credit</span>
                  <span className="text-3xl font-black text-green-600 dark:text-green-400 mt-1 block">
                    ₹{Number(contractor?.available_credit || 0).toLocaleString("en-IN")}
                  </span>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Credit Score</span>
                  <span className="text-3xl font-black text-slate-950 dark:text-slate-50 mt-1 block">
                    {contractor?.risk_score} <span className="text-sm font-normal text-slate-400">/ 100</span>
                  </span>
                </div>
              </div>

              {/* Progress utilization */}
              <div className="mt-6 pt-6 border-t">
                <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
                  <span>Credit Utilization</span>
                  <span>{Math.round(utilization * 100)}% Used</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3.5">
                  <div
                    className="bg-brand h-3.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.round(utilization * 100))}%` }}
                  />
                </div>
              </div>

              {/* Payment delay metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t text-xs font-medium text-slate-500">
                <div>
                  <span className="text-slate-400 block font-semibold">Avg Delay Days</span>
                  <span className="text-slate-800 dark:text-slate-200 text-sm font-extrabold mt-0.5 block">{Number(profile.average_payment_delay_days || 0).toFixed(1)} Days</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">On-Time Pay %</span>
                  <span className="text-slate-800 dark:text-slate-200 text-sm font-extrabold mt-0.5 block">{Number(profile.on_time_payment_percentage || 0).toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Bounced Payments</span>
                  <span className="text-slate-800 dark:text-slate-200 text-sm font-extrabold mt-0.5 block">{profile.bounced_payment_count}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Business Age</span>
                  <span className="text-slate-800 dark:text-slate-200 text-sm font-extrabold mt-0.5 block">{profile.business_age_months} Months</span>
                </div>
              </div>
            </div>

            {/* Payment Prediction Model */}
            <div className={`p-5 rounded-xl border flex justify-between items-center ${predictedRiskColor}`}>
              <div>
                <h4 className="font-extrabold text-sm uppercase tracking-wider">Payment Prediction Analyzer</h4>
                <p className="text-xs mt-1 opacity-90">
                  Rule-based predictive analysis of contractor paying within standard 30-day terms.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs block font-bold uppercase tracking-wider">Predicted Risk</span>
                <span className="text-xl font-black uppercase tracking-tight block mt-0.5">{predictedRisk}</span>
              </div>
            </div>

            {/* Invoice Aging Schedule */}
            <PageSection title="Invoice Aging Buckets" description="Outstanding liabilities segmented by calendar delay. Use for collection prioritization.">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900 border-slate-200 text-center">
                  <span className="text-xs font-bold text-slate-400 block uppercase">0–15 Days</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1 block">₹{agingBuckets.current.toLocaleString("en-IN")}</span>
                </div>
                <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900 border-slate-200 text-center">
                  <span className="text-xs font-bold text-slate-400 block uppercase">16–30 Days</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1 block">₹{agingBuckets["16-30"].toLocaleString("en-IN")}</span>
                </div>
                <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900 border-slate-200 text-center">
                  <span className="text-xs font-bold text-slate-400 block uppercase">31–60 Days</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1 block">₹{agingBuckets["31-60"].toLocaleString("en-IN")}</span>
                </div>
                <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900 border-slate-200 text-center">
                  <span className="text-xs font-bold text-slate-400 block uppercase">61–90 Days</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1 block">₹{agingBuckets["61-90"].toLocaleString("en-IN")}</span>
                </div>
                <div className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-900 border-slate-200 text-center">
                  <span className="text-xs font-bold text-slate-400 block uppercase">90+ Days</span>
                  <span className="text-lg font-black text-slate-800 dark:text-slate-100 mt-1 block">₹{agingBuckets["90+"].toLocaleString("en-IN")}</span>
                </div>
              </div>
            </PageSection>

            {/* Active projects */}
            <PageSection title="Active Projects" description="Allocated constructor limits mapped to real estate development.">
              <QueryState
                loading={activeProjects.loading}
                error={activeProjects.error}
                hasData={activeProjects.data.length > 0}
                empty={{
                  title: "No linked projects",
                  description: "Project records for this contractor will appear here."
                }}
              >
                <DataTable
                  columns={["Project Name", "Stage", "Budget / Value", "Credit Allocated", "Credit Used"]}
                  rows={activeProjects.data.map((proj: any) => [
                    proj.name,
                    <span key={proj.id} className="text-xs uppercase font-extrabold text-slate-500">
                      {proj.project_stage || "active"}
                    </span>,
                    `₹${Number(proj.project_value || 0).toLocaleString("en-IN")}`,
                    `₹${Number(proj.credit_allocated || 0).toLocaleString("en-IN")}`,
                    `₹${Number(proj.credit_used || 0).toLocaleString("en-IN")}`
                  ])}
                />
              </QueryState>
            </PageSection>

            {/* Invoice Timeline */}
            <PageSection title="Payment Timeline & Invoices" description="Chronological log of construction material invoices and payments.">
              <QueryState
                loading={invoicesList.loading}
                error={invoicesList.error}
                hasData={invoicesList.data.length > 0}
                empty={{
                  title: "No invoices generated",
                  description: "Generate material delivery invoices to track contractor payment history."
                }}
              >
                <DataTable
                  columns={["Invoice Number / Project", "Amount", "Due Date", "Payment Date", "Status", "Days Late"]}
                  rows={invoicesList.data.map((inv: any) => {
                    const statusClass =
                      inv.payment_status === "paid"
                        ? "text-green-700 bg-green-50"
                        : inv.payment_status === "overdue"
                        ? "text-red-700 bg-red-50"
                        : "text-slate-600 bg-slate-50";

                    return [
                      <div key={inv.id}>
                        <p className="font-semibold text-xs font-mono">{inv.id.slice(0, 8).toUpperCase()}</p>
                        <p className="text-xs text-slate-500 font-medium">{inv.project?.name ?? "Linked project"}</p>
                      </div>,
                      `₹${Number(inv.invoice_amount).toLocaleString("en-IN")}`,
                      new Date(inv.due_date).toLocaleDateString("en-IN"),
                      inv.payment_date ? new Date(inv.payment_date).toLocaleDateString("en-IN") : "-",
                      <span key={`${inv.id}-status`} className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${statusClass}`}>
                        {inv.payment_status}
                      </span>,
                      inv.days_late > 0 ? (
                        <span key={`${inv.id}-late`} className="text-red-600 font-bold font-mono">
                          +{inv.days_late} Days
                        </span>
                      ) : (
                        <span key={`${inv.id}-ontime`} className="text-green-700 font-medium">
                          On Time
                        </span>
                      )
                    ];
                  })}
                />
              </QueryState>
            </PageSection>

          </div>

          {/* Side Override Panel */}
          <div className="space-y-6">
            
            {/* Manual Override Card */}
            <FormCard title="Manual Credit Override" onSubmit={(e) => void handleOverride(e)}>
              <FormGrid>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Override Action</label>
                  <select
                    className="w-full p-2.5 rounded-lg border text-sm font-medium focus:ring-2 focus:ring-brand focus:border-brand"
                    value={overrideAction}
                    onChange={(e: any) => setOverrideAction(e.target.value)}
                  >
                    <option value="increase_limit">Increase Limit</option>
                    <option value="decrease_limit">Decrease Limit</option>
                    <option value="freeze_credit">Freeze Credit Line</option>
                    <option value="unfreeze_credit">Unfreeze Credit Line</option>
                  </select>
                </div>

                {["increase_limit", "decrease_limit"].includes(overrideAction) && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Amount (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 50000"
                      className="w-full p-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                      value={overrideAmount}
                      onChange={(e) => setOverrideAmount(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Audit Notes / Reason</label>
                  <textarea
                    rows={3}
                    placeholder="Enter review explanation..."
                    className="w-full p-2.5 rounded-lg border text-sm focus:ring-2 focus:ring-brand focus:border-brand"
                    value={overrideNotes}
                    onChange={(e) => setOverrideNotes(e.target.value)}
                    required
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="primary-button w-full text-center"
                    disabled={mutation.isSubmitting}
                  >
                    Apply Override Decision
                  </button>
                </div>
              </FormGrid>
              <FormNotice error={mutation.error} success={mutation.success} />
            </FormCard>

            {/* Score History / Audit Trail */}
            <PageSection title="Audit Log Trail" description="Detailed change tracking logs for regulatory compliance.">
              <QueryState
                loading={scoreHistory.loading}
                error={scoreHistory.error}
                hasData={scoreHistory.data.length > 0}
                empty={{
                  title: "No audit logs",
                  description: "Manual overrides or score recalculations will be listed here."
                }}
              >
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                  {scoreHistory.data.map((log: any) => (
                    <div key={log.id} className="p-3 border rounded-xl bg-slate-50 dark:bg-slate-900/50 space-y-1">
                      <div className="flex justify-between items-center text-xs font-extrabold text-slate-500">
                        <span className="uppercase tracking-wider text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                          {log.triggering_event}
                        </span>
                        <span>{new Date(log.created_at).toLocaleDateString("en-IN")}</span>
                      </div>
                      
                      <div className="flex justify-between items-baseline mt-1 text-xs">
                        <span className="text-slate-400">Limit Transition:</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          ₹{Number(log.previous_limit).toLocaleString("en-IN")} &rarr; ₹{Number(log.new_limit).toLocaleString("en-IN")}
                        </span>
                      </div>

                      <div className="flex justify-between items-baseline text-xs">
                        <span className="text-slate-400">Score Transition:</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {log.previous_score} &rarr; {log.new_score}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 italic mt-1 bg-white dark:bg-slate-950 p-2 border rounded">
                        "{log.notes || "No log notes recorded."}"
                      </p>
                      
                      <p className="text-[10px] text-slate-400 font-bold text-right pt-0.5">
                        By: {log.performed_by || "system"}
                      </p>
                    </div>
                  ))}
                </div>
              </QueryState>
            </PageSection>

          </div>

        </div>
      </QueryState>
    </div>
  );
}
