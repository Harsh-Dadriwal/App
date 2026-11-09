"use client";

import type { ReactNode } from "react";
import { USER_ROLE, isRoleEnabled, type AppRole } from "@mahalaxmi/core/types/domain";
import dynamic from "next/dynamic";
import { SkeletonCards } from "@/components/skeleton";

// Each page is its own chunk, loaded when it is first opened, so the first screen no
// longer downloads the code of every page for every role.
function lazyPage<P extends object>(load: () => Promise<React.ComponentType<P>>) {
  return dynamic(load, { loading: () => <SkeletonCards count={3} /> });
}

const ProjectNotesPage = lazyPage(() => import("@/components/pages/collaboration-pages/notes").then((m) => m.ProjectNotesPage));
const ElectricianDashboardPage = lazyPage(() => import("@/components/pages/contractor-pages/electrician").then((m) => m.ElectricianDashboardPage));
const ElectricianProjectsPage = lazyPage(() => import("@/components/pages/contractor-pages/electrician").then((m) => m.ElectricianProjectsPage));
const ArchitectDashboardPage = lazyPage(() => import("@/components/pages/contractor-pages/architect").then((m) => m.ArchitectDashboardPage));
const ArchitectProjectsPage = lazyPage(() => import("@/components/pages/contractor-pages/architect").then((m) => m.ArchitectProjectsPage));
const AdminDashboardPage = lazyPage(() => import("@/components/pages/contractor-pages/admin").then((m) => m.AdminDashboardPage));
const SupplierDashboardPage = lazyPage(() => import("@/components/pages/contractor-pages/supplier").then((m) => m.SupplierDashboardPage));
const AdminUsersPage = lazyPage(() => import("@/components/pages/contractor-pages/admin").then((m) => m.AdminUsersPage));
const AdminPriceListPage = lazyPage(() => import("@/components/pages/contractor-pages/price-list").then((m) => m.AdminPriceListPage));
const CustomerDashboardPage = lazyPage(() => import("@/components/pages/customer-pages").then((m) => m.CustomerDashboardPage));
const DirectoryPage = lazyPage(() => import("@/components/pages/customer-pages").then((m) => m.DirectoryPage));
const CustomerSitesPage = lazyPage(() => import("@/components/pages/customer-pages").then((m) => m.CustomerSitesPage));
const CustomerBudgetPage = lazyPage(() => import("@/components/pages/customer-pages").then((m) => m.CustomerBudgetPage));
const CustomerWalletPage = lazyPage(() => import("@/components/pages/fintech-pages").then((m) => m.CustomerWalletPage));
const CustomerSavingsPage = lazyPage(() => import("@/components/pages/fintech-pages").then((m) => m.CustomerSavingsPage));
const CustomerReferralsPage = lazyPage(() => import("@/components/pages/fintech-pages").then((m) => m.CustomerReferralsPage));
const AdminFintechPage = lazyPage(() => import("@/components/pages/fintech-pages").then((m) => m.AdminFintechPage));
const AdminCreditPage = lazyPage(() => import("@/components/pages/credit-pages").then((m) => m.AdminCreditPage));
const AdminServiceRequestsPage = lazyPage(() => import("@/components/pages/service-requests-pages").then((m) => m.AdminServiceRequestsPage));
const CustomerServiceRequestsPage = lazyPage(() => import("@/components/pages/service-requests-pages").then((m) => m.CustomerServiceRequestsPage));
const ElectricianServiceRequestsPage = lazyPage(() => import("@/components/pages/service-requests-pages").then((m) => m.ElectricianServiceRequestsPage));
const AdminOrderRequestsPage = lazyPage(() => import("@/components/pages/shop-pages").then((m) => m.AdminOrderRequestsPage));
const MyOrdersPage = lazyPage(() => import("@/components/pages/shop-pages").then((m) => m.MyOrdersPage));
const ShopPage = lazyPage(() => import("@/components/pages/shop-pages").then((m) => m.ShopPage));
const AdminQuotationsPage = lazyPage(() => import("@/components/pages/quotation-pages").then((m) => m.AdminQuotationsPage));
const QuotationsPage = lazyPage(() => import("@/components/pages/quotation-pages").then((m) => m.QuotationsPage));
const AdminSelectionsPage = lazyPage(() => import("@/components/pages/selection-pages").then((m) => m.AdminSelectionsPage));
const SelectionsPage = lazyPage(() => import("@/components/pages/selection-pages").then((m) => m.SelectionsPage));
const AccountPage = lazyPage(() => import("@/components/pages/account-page").then((m) => m.AccountPage));
const AdminPartnerIncentivesPage = lazyPage(() => import("@/components/pages/partner-incentives-pages").then((m) => m.AdminPartnerIncentivesPage));
const PartnerIncentivesPage = lazyPage(() => import("@/components/pages/partner-incentives-pages").then((m) => m.PartnerIncentivesPage));

type RolePageEntry = {
  title: string;
  component: ReactNode;
  /** Page exists only while at least one of these roles is enabled (see ENABLED_ROLES). */
  showsRoles?: AppRole[];
};

const HANDYMAN_TRADES: AppRole[] = [USER_ROLE.POP_MAN, USER_ROLE.CARPENTER, USER_ROLE.PAINTER, USER_ROLE.TILES_MAN, USER_ROLE.PLUMBER];

type RolePageRegistry = Partial<Record<AppRole, Record<string, RolePageEntry>>>;

export const rolePageRegistry: RolePageRegistry = {
  customer: {
    account: { title: "Account & privacy", component: <AccountPage /> },
    "": { title: "Dashboard", component: <CustomerDashboardPage /> },
    shop: { title: "Shop Products", component: <ShopPage ordersHref="/customer/orders" quotationsHref="/customer/quotations" /> },
    orders: { title: "My Orders", component: <MyOrdersPage shopHref="/customer/shop" /> },
    quotations: { title: "Quotations", component: <QuotationsPage shopHref="/customer/shop" ordersHref="/customer/orders" /> },
    selections: { title: "Selections", component: <SelectionsPage ordersHref="/customer/orders" quotationsHref="/customer/quotations" /> },
    "service-requests": { title: "Complaints & Installation", component: <CustomerServiceRequestsPage /> },
    professionals: {
      title: "Electricians & Architects",
      component: <DirectoryPage roles={[USER_ROLE.ELECTRICIAN, USER_ROLE.ARCHITECT]} />
    },
    handymen: {
      title: "Handymen & Trades",
      showsRoles: HANDYMAN_TRADES,
      component: (
        <DirectoryPage
          roles={[
            USER_ROLE.ELECTRICIAN,
            USER_ROLE.POP_MAN,
            USER_ROLE.CARPENTER,
            USER_ROLE.PAINTER,
            USER_ROLE.TILES_MAN,
            USER_ROLE.PLUMBER
          ]}
        />
      )
    },
    suppliers: {
      title: "Suppliers",
      showsRoles: [USER_ROLE.SUPPLIER],
      component: <DirectoryPage roles={[USER_ROLE.SUPPLIER]} />
    },
    sites: { title: "Sites", component: <CustomerSitesPage /> },
    budget: { title: "Budget Tracker", component: <CustomerBudgetPage /> },
    wallet: { title: "Wallet", component: <CustomerWalletPage /> },
    savings: { title: "Savings Plans", component: <CustomerSavingsPage /> },
    referrals: { title: "Referrals", component: <CustomerReferralsPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="customer" /> }
  },
  electrician: {
    account: { title: "Account & privacy", component: <AccountPage /> },
    "": { title: "Dashboard", component: <ElectricianDashboardPage /> },
    shop: { title: "Order Materials", component: <ShopPage ordersHref="/electrician/orders" quotationsHref="/electrician/quotations" /> },
    orders: { title: "My Orders", component: <MyOrdersPage shopHref="/electrician/shop" /> },
    quotations: { title: "Quotations", component: <QuotationsPage shopHref="/electrician/shop" ordersHref="/electrician/orders" /> },
    selections: { title: "Product Selections", component: <SelectionsPage ordersHref="/electrician/orders" quotationsHref="/electrician/quotations" incentivesHref="/electrician/incentives" /> },
    "service-requests": { title: "Service Requests", component: <ElectricianServiceRequestsPage /> },
    "projects/new": { title: "New Projects", component: <ElectricianProjectsPage mode="new" /> },
    "projects/market": {
      title: "Assigned to Others",
      component: <ElectricianProjectsPage mode="market" />
    },
    "projects/ongoing": {
      title: "Ongoing Projects",
      component: <ElectricianProjectsPage mode="ongoing" />
    },
    incentives: { title: "Partner Incentives", component: <PartnerIncentivesPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="electrician" /> }
  },
  architect: {
    account: { title: "Account & privacy", component: <AccountPage /> },
    "": { title: "Dashboard", component: <ArchitectDashboardPage /> },
    shop: { title: "Shop Products", component: <ShopPage ordersHref="/architect/orders" quotationsHref="/architect/quotations" /> },
    orders: { title: "My Orders", component: <MyOrdersPage shopHref="/architect/shop" /> },
    quotations: { title: "Quotations", component: <QuotationsPage shopHref="/architect/shop" ordersHref="/architect/orders" /> },
    selections: { title: "Product Selections", component: <SelectionsPage ordersHref="/architect/orders" quotationsHref="/architect/quotations" incentivesHref="/architect/incentives" /> },
    "projects/new": { title: "New Projects", component: <ArchitectProjectsPage mode="new" /> },
    "projects/ongoing": {
      title: "Ongoing Projects",
      component: <ArchitectProjectsPage mode="ongoing" />
    },
    incentives: { title: "Partner Incentives", component: <PartnerIncentivesPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="architect" /> }
  },
  admin: {
    account: { title: "Account & privacy", component: <AccountPage /> },
    "": { title: "Dashboard", component: <AdminDashboardPage /> },
    orders: { title: "Orders", component: <AdminOrderRequestsPage /> },
    quotations: { title: "Quotations", component: <AdminQuotationsPage /> },
    selections: { title: "Product Selections", component: <AdminSelectionsPage /> },
    "service-requests": { title: "Service Requests", component: <AdminServiceRequestsPage /> },
    users: { title: "Users & Verification", component: <AdminUsersPage /> },
    "price-list": { title: "Price List & Stock", component: <AdminPriceListPage /> },
    fintech: { title: "Wallets, Savings & Referrals", component: <AdminFintechPage /> },
    credit: { title: "Contractor Credit Engine", component: <AdminCreditPage /> },
    incentives: { title: "Partner Incentives", component: <AdminPartnerIncentivesPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="admin" /> }
  },
  supplier: {
    account: { title: "Account & privacy", component: <AccountPage /> },
    "": { title: "Dashboard", component: <SupplierDashboardPage /> }
  }
};

export function getRolePage(role: AppRole, pathPart: string) {
  if (!isRoleEnabled(role)) return null;
  const page = rolePageRegistry[role]?.[pathPart] ?? null;
  if (page?.showsRoles && !page.showsRoles.some(isRoleEnabled)) return null;
  return page;
}
