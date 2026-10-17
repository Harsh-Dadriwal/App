"use client";

import type { ReactNode } from "react";
import { USER_ROLE, isRoleEnabled, type AppRole } from "@mahalaxmi/core/types/domain";
import { ProjectNotesPage } from "@/components/pages/collaboration-pages";
import {
  ElectricianDashboardPage,
  ElectricianProjectsPage,
  ArchitectDashboardPage,
  ArchitectProjectsPage,
  AdminDashboardPage,
  SupplierDashboardPage,
  AdminUsersPage,
  AdminPriceListPage
} from "@/components/pages/contractor-pages";
import {
  CustomerDashboardPage,
  DirectoryPage,
  CustomerSitesPage,
  CustomerBudgetPage
} from "@/components/pages/customer-pages";
import {
  CustomerWalletPage,
  CustomerSavingsPage,
  CustomerReferralsPage,
  AdminFintechPage
} from "@/components/pages/fintech-pages";
import { AdminCreditPage } from "@/components/pages/credit-pages";
import {
  AdminServiceRequestsPage,
  CustomerServiceRequestsPage,
  ElectricianServiceRequestsPage
} from "@/components/pages/service-requests-pages";
import { AdminOrderRequestsPage, MyOrdersPage, ShopPage } from "@/components/pages/shop-pages";
import { AdminQuotationsPage, QuotationsPage } from "@/components/pages/quotation-pages";
import { AdminSelectionsPage, SelectionsPage } from "@/components/pages/selection-pages";
import {
  AdminPartnerIncentivesPage,
  PartnerIncentivesPage
} from "@/components/pages/partner-incentives-pages";

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
    "": { title: "Dashboard", component: <SupplierDashboardPage /> }
  }
};

export function getRolePage(role: AppRole, pathPart: string) {
  if (!isRoleEnabled(role)) return null;
  const page = rolePageRegistry[role]?.[pathPart] ?? null;
  if (page?.showsRoles && !page.showsRoles.some(isRoleEnabled)) return null;
  return page;
}
