"use client";

import type { ReactNode } from "react";
import { USER_ROLE, type AppRole } from "@mahalaxmi/core/types/domain";
import {
  ProjectNotesPage,
  ArchitectProductRequestsPage,
  AdminProductRequestsPage,
  AdminCatalogPage,
  AdminAssignmentsPage
} from "@/components/pages/collaboration-pages";
import {
  ElectricianDashboardPage,
  ElectricianProjectsPage,
  ElectricianMaterialsPage,
  ArchitectDashboardPage,
  ArchitectProjectsPage,
  ArchitectMaterialsPage,
  AdminDashboardPage,
  SupplierDashboardPage,
  AdminUsersPage,
  AdminOrdersPage,
  AdminProductsPage,
  AdminSubstitutionsPage,
  AdminContentPage
} from "@/components/pages/contractor-pages";
import {
  CustomerDashboardPage,
  DirectoryPage,
  CustomerSitesPage,
  TipsPage,
  CustomerBudgetPage,
  CustomerFinancePage,
  CustomerApprovalsPage
} from "@/components/pages/customer-pages";
import {
  CustomerWalletPage,
  CustomerSavingsPage,
  CustomerReferralsPage,
  AdminFintechPage
} from "@/components/pages/fintech-pages";
import { LightingVisualizerPage } from "@/components/pages/lighting-pages";
import { AdminWorkflowHubPage } from "@/components/order-workflow";
import {
  AdminRequirementsPage,
  RequirementIntakePage
} from "@/components/pages/requirements-pages";

type RolePageEntry = {
  title: string;
  component: ReactNode;
};

type RolePageRegistry = Partial<Record<AppRole, Record<string, RolePageEntry>>>;

export const rolePageRegistry: RolePageRegistry = {
  customer: {
    "": { title: "Dashboard", component: <CustomerDashboardPage /> },
    requirements: { title: "Requirements", component: <RequirementIntakePage role="customer" /> },
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
      component: <DirectoryPage roles={[USER_ROLE.SUPPLIER]} />
    },
    sites: { title: "Sites", component: <CustomerSitesPage /> },
    "tips/electrical": {
      title: "Electrical Tips",
      component: <TipsPage category="electrical_tips" />
    },
    "tips/home": { title: "Home Tips", component: <TipsPage category="home_tips" /> },
    budget: { title: "Budget Tracker", component: <CustomerBudgetPage /> },
    finance: { title: "Finance Facility", component: <CustomerFinancePage /> },
    wallet: { title: "Wallet", component: <CustomerWalletPage /> },
    savings: { title: "Savings Plans", component: <CustomerSavingsPage /> },
    referrals: { title: "Referrals", component: <CustomerReferralsPage /> },
    approvals: { title: "Items on Approval", component: <CustomerApprovalsPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="customer" /> }
  },
  electrician: {
    "": { title: "Dashboard", component: <ElectricianDashboardPage /> },
    requirements: { title: "Requirements", component: <RequirementIntakePage role="electrician" /> },
    "projects/new": { title: "New Projects", component: <ElectricianProjectsPage mode="new" /> },
    "projects/market": {
      title: "Assigned to Others",
      component: <ElectricianProjectsPage mode="market" />
    },
    "projects/ongoing": {
      title: "Ongoing Projects",
      component: <ElectricianProjectsPage mode="ongoing" />
    },
    materials: { title: "Material Tracker", component: <ElectricianMaterialsPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="electrician" /> }
  },
  architect: {
    "": { title: "Dashboard", component: <ArchitectDashboardPage /> },
    requirements: { title: "Requirements", component: <RequirementIntakePage role="architect" /> },
    lighting: { title: "Lighting Visualizer", component: <LightingVisualizerPage role="architect" /> },
    "projects/new": { title: "New Projects", component: <ArchitectProjectsPage mode="new" /> },
    "projects/ongoing": {
      title: "Ongoing Projects",
      component: <ArchitectProjectsPage mode="ongoing" />
    },
    materials: { title: "Material Tracker", component: <ArchitectMaterialsPage /> },
    requests: { title: "Product Requests", component: <ArchitectProductRequestsPage /> },
    notes: { title: "Project Notes", component: <ProjectNotesPage role="architect" /> }
  },
  admin: {
    "": { title: "Dashboard", component: <AdminDashboardPage /> },
    requirements: { title: "Requirements Queue", component: <AdminRequirementsPage /> },
    lighting: { title: "Lighting Leads", component: <LightingVisualizerPage role="admin" /> },
    users: { title: "Users & Verification", component: <AdminUsersPage /> },
    assignments: { title: "Site Assignments", component: <AdminAssignmentsPage /> },
    orders: { title: "Orders", component: <AdminOrdersPage /> },
    workflows: { title: "Workflow Center", component: <AdminWorkflowHubPage /> },
    products: { title: "Products & Inventory", component: <AdminProductsPage /> },
    catalog: { title: "Categories & Brands", component: <AdminCatalogPage /> },
    fintech: { title: "Wallets, Savings & Referrals", component: <AdminFintechPage /> },
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
  return rolePageRegistry[role]?.[pathPart] ?? null;
}
