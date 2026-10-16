"use client";

import type { ReactNode } from "react";
import { USER_ROLE, isRoleEnabled, type AppRole } from "@mahalaxmi/core/types/domain";
import {
  ProjectNotesPage,
  ArchitectProductRequestsPage,
  AdminProductRequestsPage,
  AdminAssignmentsPage
} from "@/components/pages/collaboration-pages";
import {
  ElectricianDashboardPage,
  ElectricianProjectsPage,
  ArchitectDashboardPage,
  ArchitectProjectsPage,
  ArchitectMaterialsPage,
  AdminDashboardPage,
  SupplierDashboardPage,
  AdminUsersPage,
  AdminOrdersPage,
  AdminPriceListPage,
  AdminSubstitutionsPage,
  AdminContentPage
} from "@/components/pages/contractor-pages";
import {
  CustomerDashboardPage,
  DirectoryPage,
  CustomerSitesPage,
  TipsPage,
  CustomerBudgetPage,
  CustomerApprovalsPage
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
import { LightingVisualizerPage } from "@/components/pages/lighting-pages";
import { AdminWorkflowHubPage } from "@/components/order-workflow";
import {
  AdminRequirementsPage,
  RequirementIntakePage
} from "@/components/pages/requirements-pages";
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
    shop: { title: "Shop Products", component: <ShopPage ordersHref="/customer/orders" /> },
    orders: { title: "My Orders", component: <MyOrdersPage shopHref="/customer/shop" /> },
    requirements: { title: "Requirements", component: <RequirementIntakePage role="customer" /> },
    "service-requests": { title: "Complaints & Installation", component: <CustomerServiceRequestsPage /> },
    lighting: { title: "Lighting Visualizer", component: <LightingVisualizerPage role="customer" /> },
    electricians: {
      title: "Electricians Directory",
      component: <DirectoryPage roles={[USER_ROLE.ELECTRICIAN]} />
    },
    architects: {
      title: "Architects Directory",
      component: <DirectoryPage roles={[USER_ROLE.ARCHITECT]} />
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
    "tips/electrical": {
      title: "Electrical Tips",
      component: <TipsPage category="electrical_tips" />
    },
    "tips/home": { title: "Home Tips", component: <TipsPage category="home_tips" /> },
    budget: { title: "Budget Tracker", component: <CustomerBudgetPage /> },
    wallet: { title: "Wallet", component: <CustomerWalletPage /> },
    savings: { title: "Savings Plans", component: <CustomerSavingsPage /> },
    referrals: { title: "Referrals", component: <CustomerReferralsPage /> },
    approvals: { title: "Items on Approval", component: <CustomerApprovalsPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="customer" /> }
  },
  electrician: {
    "": { title: "Dashboard", component: <ElectricianDashboardPage /> },
    shop: { title: "Order Materials", component: <ShopPage ordersHref="/electrician/orders" /> },
    orders: { title: "My Orders", component: <MyOrdersPage shopHref="/electrician/shop" /> },
    requirements: { title: "Requirements", component: <RequirementIntakePage role="electrician" /> },
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
    // The old product-based order builder; ordering is now from the price list.
    materials: { title: "Order Materials", component: <ShopPage ordersHref="/electrician/orders" /> },
    incentives: { title: "Partner Incentives", component: <PartnerIncentivesPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="electrician" /> }
  },
  architect: {
    "": { title: "Dashboard", component: <ArchitectDashboardPage /> },
    shop: { title: "Shop Products", component: <ShopPage ordersHref="/architect/orders" /> },
    orders: { title: "My Orders", component: <MyOrdersPage shopHref="/architect/shop" /> },
    requirements: { title: "Requirements", component: <RequirementIntakePage role="architect" /> },
    lighting: { title: "Lighting Visualizer", component: <LightingVisualizerPage role="architect" /> },
    "projects/new": { title: "New Projects", component: <ArchitectProjectsPage mode="new" /> },
    "projects/ongoing": {
      title: "Ongoing Projects",
      component: <ArchitectProjectsPage mode="ongoing" />
    },
    materials: { title: "Material Tracker", component: <ArchitectMaterialsPage /> },
    incentives: { title: "Partner Incentives", component: <PartnerIncentivesPage /> },
    requests: { title: "Product Requests", component: <ArchitectProductRequestsPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="architect" /> }
  },
  admin: {
    "": { title: "Dashboard", component: <AdminDashboardPage /> },
    requirements: { title: "Requirements Queue", component: <AdminRequirementsPage /> },
    "service-requests": { title: "Service Requests", component: <AdminServiceRequestsPage /> },
    lighting: { title: "Lighting Leads", component: <LightingVisualizerPage role="admin" /> },
    users: { title: "Users & Verification", component: <AdminUsersPage /> },
    assignments: { title: "Site Assignments", component: <AdminAssignmentsPage /> },
    orders: { title: "Orders", component: <AdminOrderRequestsPage /> },
    "site-orders": { title: "Site Orders", component: <AdminOrdersPage /> },
    workflows: { title: "Workflow Center", component: <AdminWorkflowHubPage /> },
    "price-list": { title: "Price List & Stock", component: <AdminPriceListPage /> },
    fintech: { title: "Wallets, Savings & Referrals", component: <AdminFintechPage /> },
    credit: { title: "Contractor Credit Engine", component: <AdminCreditPage /> },
    incentives: { title: "Partner Incentives", component: <AdminPartnerIncentivesPage /> },
    requests: { title: "Product Requests", component: <AdminProductRequestsPage /> },
    substitutions: { title: "Substitutions", component: <AdminSubstitutionsPage /> },
    content: { title: "Tips Content", component: <AdminContentPage /> },
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
