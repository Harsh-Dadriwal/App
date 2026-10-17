"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { listOrderRequests, listQuotations } from "@/lib/backend/modules/shop-gateway";
import { listServiceRequests } from "@/lib/backend/modules/service-requests-gateway";
import {
  CardGrid,
  DataCard,
  FormNotice,
  ListSearchField,
  PageSection,
  QueryState,
  StatsGrid,
  useMutationAction,
  useRows
} from "@/components/data-view";
import { getSupabaseBrowserClient } from "@mahalaxmi/core/supabase/client";
import { roleLabels, type AppRole } from "@mahalaxmi/core/types/domain";
import { verifyProfessionalUser } from "@/lib/backend/modules/workflow-gateway";
import { ADMIN_MANAGED_USER_ROLES } from "./shared";
export function AdminDashboardPage() {
  const users = useRows(
    async (client) => {
      const { data, error } = await client.from("users").select("role, verification_status");
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );
  const orders = useRows(async () => {
    const result = await listOrderRequests();
    return { data: result.data?.orders ?? [], error: result.error };
  }, []);
  const quotations = useRows(async () => {
    const result = await listQuotations();
    return { data: result.data?.quotations ?? [], error: result.error };
  }, []);
  const serviceRequests = useRows(async () => {
    const result = await listServiceRequests();
    return { data: result.data?.requests ?? [], error: result.error };
  }, []);

  const pendingVerifications = users.data.filter((user: any) => user.verification_status === "pending").length;
  const newOrders = orders.data.filter((order) => order.status === "submitted").length;
  const activeOrders = orders.data.filter((order) => order.status === "confirmed" || order.status === "ready").length;
  const newQuotations = quotations.data.filter((quotation) => quotation.status === "requested").length;
  const openService = serviceRequests.data.filter((request) => request.status === "open").length;
  const nextStep =
    newOrders > 0
      ? { href: "/admin/orders", label: `Confirm ${newOrders} new order${newOrders === 1 ? "" : "s"}` }
      : newQuotations > 0
        ? { href: "/admin/quotations", label: `Price ${newQuotations} quotation request${newQuotations === 1 ? "" : "s"}` }
        : pendingVerifications > 0
          ? { href: "/admin/users", label: `Review ${pendingVerifications} pending verification${pendingVerifications === 1 ? "" : "s"}` }
          : null;

  return (
    <div className="page-stack">
      <StatsGrid
        items={[
          { label: "New orders", value: newOrders },
          { label: "Orders in progress", value: activeOrders },
          { label: "Quotation requests", value: newQuotations },
          { label: "Open service requests", value: openService },
          { label: "Users", value: users.data.length },
          { label: "Pending verifications", value: pendingVerifications }
        ]}
      />
      <PageSection
        title={nextStep ? "Needs your attention" : "All caught up"}
        description={nextStep ? "Start with the most urgent queue." : "No new orders, quotation requests or verifications are waiting."}
      >
        <div className="inline-actions" style={{ flexWrap: "wrap", gap: "0.75rem" }}>
          {nextStep ? (
            <Link className="primary-button" href={nextStep.href}>
              {nextStep.label}
            </Link>
          ) : null}
          <Link className="secondary-button" href="/admin/orders">
            Orders
          </Link>
          <Link className="secondary-button" href="/admin/quotations">
            Quotations
          </Link>
          <Link className="secondary-button" href="/admin/price-list">
            Price list & stock
          </Link>
        </div>
      </PageSection>
    </div>
  );
}

export function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const mutation = useMutationAction();
  const users = useRows(
    async (client) => {
      const { data, error } = await client
        .from("users")
        .select("id, username, full_name, email, phone, role, verification_status, is_admin_verified")
        .order("created_at", { ascending: false });
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    []
  );

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return users.data;
    }

    return users.data.filter((user: any) =>
      [user.username, user.full_name, user.email, user.phone, roleLabels[user.role as AppRole] ?? user.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [search, users.data]);

  async function setCreditLimit(userId: string, limit: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => client.from("users").update({ credit_limit: Number(limit), credit_balance: Number(limit) }).eq("id", userId),
      "Credit limit updated."
    );
    if (ok) users.refetch?.();
  }

  async function promoteUserRole(userId: string, newRole: AppRole) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => {
        const [userUpdate, membershipUpdate] = await Promise.all([
          client
            .from("users")
            .update({
              role: newRole,
              verification_status: "verified",
              is_admin_verified: true
            })
            .eq("id", userId),
          client
            .from("tenant_memberships")
            .update({ role: newRole })
            .eq("user_id", userId)
            .eq("is_active", true)
        ]);

        return {
          error: userUpdate.error ?? membershipUpdate.error ?? null
        };
      },
      `User role changed to ${newRole} successfully.`
    );
    if (ok) users.refetch?.();
  }

  async function verifyUser(userId: string, approve: boolean) {
    const ok = await mutation.run(async () => verifyProfessionalUser({
      target_user_id: userId,
      approve,
      admin_note: approve ? "Verified from admin panel" : "Rejected from admin panel"
    }), approve ? "Professional verified." : "Professional rejected.");
    if (ok) users.refetch?.();
  }

  return (
    <PageSection
      title="Users, verification & promotion"
      description="Search users, review usernames and assign professional roles."
    >
      <QueryState
        loading={users.loading}
        error={users.error}
        hasData={users.data.length > 0}
        empty={{ title: "No users found", description: "Users will appear here once they sign up." }}
      >
        <FormNotice error={mutation.error} success={mutation.success} />
        <ListSearchField
          value={search}
          onChange={setSearch}
          placeholder="Search by username, full name, email, phone, or role"
          ariaLabel="Search users"
        />
        <QueryState
          loading={false}
          error={null}
          hasData={visibleUsers.length > 0}
          empty={{ title: "No users match", description: "Try another name, username, phone number, or clear the search." }}
        >
          <CardGrid>
            {visibleUsers.map((user: any) => (
              <DataCard key={user.id} title={user.full_name ?? "-"} subtitle={user.email ?? user.phone} meta={user.role}>
                <p>Username: {user.username ?? "-"}</p>
                <p>Verification: {user.verification_status}</p>
                <p>Admin verified: {user.is_admin_verified ? "Yes" : "No"}</p>
                {user.credit_limit !== undefined && (
                  <p>Credit: ₹{Number(user.credit_limit).toLocaleString("en-IN")}</p>
                )}
                <div className="inline-actions" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                  {user.role === "admin" ? (
                    <p className="role-protection-note">Admin role is protected and cannot be changed here.</p>
                  ) : (
                    <label style={{ minWidth: 180 }}>
                      <span style={{ display: "block", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                        Promote or change role
                      </span>
                      <select
                        className="input"
                        value={user.role}
                        disabled={mutation.isSubmitting}
                        onChange={(event) => void promoteUserRole(user.id, event.target.value as AppRole)}
                      >
                        {ADMIN_MANAGED_USER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {["electrician", "architect", "customer"].includes(user.role) && (
                    <button 
                      type="button" 
                      className="secondary-button" 
                      onClick={() => {
                        const limit = prompt("Enter credit limit for this user:", String(user.credit_limit || 0));
                        if (limit !== null) setCreditLimit(user.id, limit);
                      }}
                      style={{ fontSize: '0.75rem', padding: '0.5rem 0.875rem' }}
                    >
                      Set Credit
                    </button>
                  )}
                  {[
                    "electrician",
                    "architect",
                    "pop_man",
                    "carpenter",
                    "painter",
                    "tiles_man",
                    "plumber"
                  ].includes(user.role) && !user.is_admin_verified && (
                    <>
                      <button type="button" className="primary-button" disabled={mutation.isSubmitting} onClick={() => void verifyUser(user.id, true)} style={{ fontSize: '0.75rem', padding: '0.5rem 0.875rem' }}>Verify</button>
                      <button type="button" className="secondary-button" disabled={mutation.isSubmitting} onClick={() => void verifyUser(user.id, false)} style={{ fontSize: '0.75rem', padding: '0.5rem 0.875rem' }}>Reject</button>
                    </>
                  )}
                </div>
              </DataCard>
            ))}
          </CardGrid>
        </QueryState>
      </QueryState>
    </PageSection>
  );
}
