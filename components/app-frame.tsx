"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutationAction, useRows } from "@/components/data-view";
import { useAuth } from "@/components/providers/auth-provider";
import { SkeletonWorkspace, TopProgressBar } from "@/components/skeleton";
import { useTheme } from "@/components/theme-provider";
import { NavIcon } from "@/components/nav-icon";
import { getRoleNavGroups, roleLabels } from "@/lib/navigation";
import type { AppRole } from "@mahalaxmi/core/types/domain";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from "@/lib/backend/modules/notifications-gateway";

function SetupView() {
  return (
    <main className="setup-shell">
      <section className="setup-card">
        <span className="eyebrow">Service unavailable</span>
        <h1>We cannot load your workspace right now. Please try again shortly.</h1>
      </section>
    </main>
  );
}

function LoadingView() {
  return <SkeletonWorkspace />;
}

function ThemeIcon({ dark }: { dark: boolean }) {
  return dark ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { theme, toggleTheme } = useTheme();

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
    async () => {
      if (!profile?.id) {
        return { data: [] as any[], error: null };
      }
      const result = await listNotifications(profile.id, activeTenant?.id ?? null);
      return { data: result.data ?? [], error: result.error };
    },
    [profile?.id, activeTenant?.id]
  );
  
  const mutation = useMutationAction();

  const navBadges = useMemo(() => {
    const unreadNotes = notifications.data.filter((item: any) => item.data?.module === "site_notes" && !item.is_read).length;
    const unread = (module: string) => notifications.data.filter((item: any) => item.data?.module === module && !item.is_read).length;
    const unreadServiceRequests = notifications.data.filter((item: any) => item.data?.module === "service_requests" && !item.is_read).length;
    const unreadOrders = unread("order_requests");
    const unreadQuotations = unread("quotations");
    const unreadSelections = unread("selections");
    return {
      "/customer/orders": unreadOrders,
      "/electrician/orders": unreadOrders,
      "/architect/orders": unreadOrders,
      "/admin/orders": unreadOrders,
      "/customer/quotations": unreadQuotations,
      "/electrician/quotations": unreadQuotations,
      "/architect/quotations": unreadQuotations,
      "/admin/quotations": unreadQuotations,
      "/customer/selections": unreadSelections,
      "/electrician/selections": unreadSelections,
      "/architect/selections": unreadSelections,
      "/customer/service-requests": unreadServiceRequests,
      "/electrician/service-requests": unreadServiceRequests,
      "/customer/notes": unreadNotes,
      "/electrician/notes": unreadNotes,
      "/architect/notes": unreadNotes,
      "/admin/notes": unreadNotes,
      "/admin/service-requests": unreadServiceRequests
    } as Record<string, number>;
  }, [notifications.data]);

  async function handleMarkNotificationRead(notificationId: string) {
    const ok = await mutation.run(
      async () => markNotificationRead(notificationId),
      "Notification marked as read."
    );
    if (ok) notifications.refetch?.();
  }

  async function markAllRead() {
    const unreadIds = notifications.data.filter((item: any) => !item.is_read).map((item: any) => item.id);
    if (unreadIds.length === 0) return;
    const ok = await mutation.run(
      async () => markAllNotificationsRead(unreadIds),
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
      router.refresh();
      setIsSidebarOpen(false); // close sidebar on tenant switch
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

  // Handle route changes to close mobile sidebar gracefully
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  if (!configured) {
    return <SetupView />;
  }

  if (isLoading || !session || !profile || profile.role !== role) {
    return <LoadingView />;
  }

  return (
    <main className="workspace-shell">
      {/* Mobile Drawer Overlay */}
      <div 
        className={`sidebar-overlay ${isSidebarOpen ? "is-open" : ""}`} 
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`workspace-sidebar ${isSidebarOpen ? "is-open" : ""}`}>
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

        <nav className="sidebar-nav" aria-label="Main menu">
          {getRoleNavGroups(role).map((section) => (
            <div className="nav-section" key={section.group}>
              {section.items.length && section.group !== "Overview" ? <p className="nav-section-label">{section.group}</p> : null}
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== `/${role}` && pathname.startsWith(`${item.href}/`));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={active ? "nav-link is-active" : "nav-link"}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setIsSidebarOpen(false)}
                  >
                    <NavIcon name={item.icon} />
                    <span className="nav-link-label">{item.label}</span>
                    {navBadges[item.href] ? <span className="nav-badge">{navBadges[item.href]}</span> : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-profile">
          <div className="sidebar-user">
            <span className="sidebar-avatar" aria-hidden="true">
              {(profile.full_name ?? "U").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
            </span>
            <div className="sidebar-user-copy">
              <strong>{profile.full_name ?? "User"}</strong>
              <span>{profile.email ?? profile.phone ?? roleLabels[role]}</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button type="button" className="sidebar-action" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"}>
              <ThemeIcon dark={theme === "dark"} />
            </button>
            <Link className="sidebar-action" href={`/${role}/account`} aria-label="Account and privacy" title="Account & privacy" onClick={() => setIsSidebarOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </Link>
            <button type="button" className="sidebar-action sidebar-action--logout" onClick={() => { setLoggingOut(true); void signOut(); }} disabled={loggingOut}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
              <span>{loggingOut ? "Logging out…" : "Log out"}</span>
            </button>
          </div>
        </div>
      </aside>

      <section className="workspace-main">
        <TopProgressBar />
        <header className="workspace-header">
          <div className="header-left">
            <button 
              type="button" 
              className="menu-toggle-btn"
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
            <div className="header-title-block">
              <div className="eyebrow">
                {activeTenant?.app_name ?? "Mahalaxmi Electricals"} • {roleLabels[role]}
              </div>
              <h1>{title ?? "Workspace"}</h1>
            </div>
          </div>
          
          <div className="header-aside">
            <button type="button" className="theme-toggle theme-toggle--icon" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <ThemeIcon dark={theme === "dark"} />
            </button>
            <div className="header-user-card">
              <strong>{profile.full_name ?? "User"}</strong>
              <span>
                {roleLabels[role]}
                {profile.company_name ? ` • ${profile.company_name}` : ""}
              </span>
            </div>
            <div className="header-notifications">
              <button 
                type="button" 
                aria-label="View notifications"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </button>
              <div className="notification-list">
                <div className="header-notifications-head" style={{ padding: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', margin: 0 }}>
                  <strong style={{ fontSize: '0.875rem' }}>Inbox</strong>
                  <button type="button" className="secondary-button" onClick={() => void markAllRead()} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                    Mark all read
                  </button>
                </div>
                <div>
                  {notifications.data.length ? notifications.data.map((item: any) => (
                    <article key={item.id} className={item.is_read ? "notification-item" : "notification-item notification-item--unread"}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.body}</p>
                        <small>{new Date(item.created_at).toLocaleString("en-IN")}</small>
                      </div>
                      {!item.is_read ? (
                          <button type="button" className="secondary-button" onClick={() => void handleMarkNotificationRead(item.id)}>
                          Read
                        </button>
                      ) : null}
                    </article>
                  )) : <p className="notification-empty" style={{ padding: '1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>No new notifications.</p>}
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="page-content fade-in">
          {errorMessage ? <p className="notice error">{errorMessage}</p> : null}
          {children}
        </div>
      </section>
    </main>
  );
}
