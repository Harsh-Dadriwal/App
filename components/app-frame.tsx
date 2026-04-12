"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useMutationAction, useRows } from "@/components/data-view";
import { useAuth } from "@/components/providers/auth-provider";
import { roleLabels, roleNav } from "@/lib/navigation";
import type { AppRole } from "@/lib/app-types";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function SetupView() {
  return (
    <main className="setup-shell">
      <section className="setup-card">
        <span className="eyebrow">Supabase Setup Required</span>
        <h1>Connect the app with your Supabase project before using the role-based workspace.</h1>
        <p>
          Add your project URL and anon key to <code>.env.local</code>, then run the Supabase SQL
          files in the SQL editor.
        </p>
        <div className="code-block">
          <code>NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co</code>
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key</code>
        </div>
      </section>
    </main>
  );
}

function LoadingView() {
  return (
    <main className="loading-shell">
      <div className="loading-card">
        <span className="eyebrow">Connecting</span>
        <h1>Loading your Mahalaxmi Electricals workspace...</h1>
      </div>
    </main>
  );
}

export function AppFrame({
  role,
  title,
  children
}: {
  role: AppRole;
  title?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    configured,
    isLoading,
    session,
    profile,
    tenantMemberships,
    activeTenant,
    errorMessage,
    switchTenant,
    signOut
  } = useAuth();
  const notifications = useRows(
    async (client) => {
      if (!profile?.id) {
        return { data: [] as any[], error: null };
      }
      const { data, error } = await client
        .from("notifications")
        .select("id, title, body, is_read, data, created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(8);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [profile?.id]
  );
  const approvals = useRows(
    async (client) => {
      if (role !== "customer" || !profile?.id) {
        return { data: [] as any[], error: null };
      }
      const { data, error } = await client
        .from("vw_customer_items_on_approval")
        .select("order_item_id")
        .eq("customer_id", profile.id);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [role, profile?.id]
  );
  const adminRequests = useRows(
    async (client) => {
      if (role !== "admin") {
        return { data: [] as any[], error: null };
      }
      const { data, error } = await client
        .from("product_requests")
        .select("id, status")
        .in("status", ["submitted", "reviewing", "matched"]);
      return { data: (data ?? []) as any[], error: error?.message ?? null };
    },
    [role]
  );
  const mutation = useMutationAction();

  const navBadges = useMemo(() => {
    const unreadNotes = notifications.data.filter((item: any) => item.data?.module === "site_notes" && !item.is_read).length;
    const unreadRequests = notifications.data.filter((item: any) => item.data?.module === "product_requests" && !item.is_read).length;
    return {
      "/customer/approvals": approvals.data.length,
      "/customer/notes": unreadNotes,
      "/electrician/notes": unreadNotes,
      "/architect/notes": unreadNotes,
      "/architect/requests": unreadRequests,
      "/admin/notes": unreadNotes,
      "/admin/requests": adminRequests.data.length || unreadRequests
    } as Record<string, number>;
  }, [notifications.data, approvals.data.length, adminRequests.data.length]);

  async function markNotificationRead(notificationId: string) {
    const client = await getSupabaseBrowserClient();
    if (!client) return;
    const ok = await mutation.run(
      async () => client.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", notificationId),
      "Notification marked as read."
    );
    if (ok) notifications.refetch?.();
  }

  async function markAllRead() {
    const client = await getSupabaseBrowserClient();
    if (!client || !profile?.id) return;
    const unreadIds = notifications.data.filter((item: any) => !item.is_read).map((item: any) => item.id);
    if (unreadIds.length === 0) return;
    const ok = await mutation.run(
      async () => client.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", unreadIds),
      "All notifications marked as read."
    );
    if (ok) notifications.refetch?.();
  }

  async function handleTenantChange(tenantId: string) {
    if (!tenantId || tenantId === activeTenant?.id) {
      return;
    }

    const ok = await switchTenant(tenantId);

    if (ok) {
      notifications.refetch?.();
      approvals.refetch?.();
      adminRequests.refetch?.();
      router.refresh();
    }
  }

  useEffect(() => {
    if (!configured || isLoading) {
      return;
    }

    if (!session) {
      router.replace("/auth");
      return;
    }

    if (!profile) {
      return;
    }

    if (profile.role !== role) {
      router.replace(`/${profile.role}`);
    }
  }, [configured, isLoading, session, profile, role, router]);

  if (!configured) {
    return <SetupView />;
  }

  if (isLoading || !session || !profile || profile.role !== role) {
    return <LoadingView />;
  }

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">
            {(activeTenant?.app_name ?? "ME")
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <p className="brand-name">{activeTenant?.app_name ?? "Mahalaxmi Electricals"}</p>
            <small>
              {roleLabels[role]} workspace
              {activeTenant?.display_name ? ` • ${activeTenant.display_name}` : ""}
            </small>
          </div>
        </div>

        {tenantMemberships.length > 1 ? (
          <label className="field-shell">
            <span className="field-label">Active business</span>
            <select
              className="input"
              value={activeTenant?.id ?? ""}
              onChange={(event) => void handleTenantChange(event.target.value)}
            >
              {tenantMemberships.map((membership) => (
                <option key={membership.id} value={membership.tenant_id}>
                  {membership.branding?.app_name ?? membership.tenant?.display_name ?? membership.tenant_id}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <nav className="sidebar-nav">
          {roleNav[role].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? "nav-link is-active" : "nav-link"}
            >
              <span>{item.label}</span>
              {navBadges[item.href] ? <span className="nav-badge">{navBadges[item.href]}</span> : null}
            </Link>
          ))}
        </nav>

        <div className="sidebar-profile">
          <strong>{profile.full_name ?? "User"}</strong>
          <span>{profile.email ?? profile.phone ?? roleLabels[role]}</span>
          <button type="button" className="secondary-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">
              {activeTenant?.app_name ?? "Mahalaxmi Electricals"} • {roleLabels[role]}
            </span>
            <h1>{title ?? "Workspace"}</h1>
            {activeTenant?.membership_role ? (
              <p className="helper-copy">
                Tenant access: {activeTenant.membership_role}
                {activeTenant.slug ? ` • ${activeTenant.slug}` : ""}
              </p>
            ) : null}
          </div>
          <div className="header-aside">
            <div className="header-user-card">
              <strong>{profile.full_name ?? "User"}</strong>
              <span>
                {roleLabels[role]}
                {profile.company_name ? ` • ${profile.company_name}` : ""}
              </span>
            </div>
            <div className="header-notifications">
              <div className="header-notifications-head">
                <strong>Inbox</strong>
                <button type="button" className="secondary-button" onClick={() => void markAllRead()}>
                  Mark all read
                </button>
              </div>
              <div className="notification-list">
                {notifications.data.length ? notifications.data.map((item: any) => (
                  <article key={item.id} className={item.is_read ? "notification-item" : "notification-item notification-item--unread"}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.body}</p>
                      <small>{new Date(item.created_at).toLocaleString("en-IN")}</small>
                    </div>
                    {!item.is_read ? (
                      <button type="button" className="secondary-button" onClick={() => void markNotificationRead(item.id)}>
                        Read
                      </button>
                    ) : null}
                  </article>
                )) : <p className="notification-empty">No new notifications.</p>}
              </div>
            </div>
          </div>
        </header>

        {errorMessage ? <p className="notice error">{errorMessage}</p> : null}
        {children}
      </section>
    </main>
  );
}
