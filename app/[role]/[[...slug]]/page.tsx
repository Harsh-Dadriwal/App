"use client";

import { use, useMemo } from "react";
import { notFound } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { USER_ROLE, type AppRole } from "@mahalaxmi/core/types/domain";
import { roleLabels } from "@/lib/navigation";
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

export default function RolePage({
  params
}: {
  params: Promise<{ role: string; slug?: string[] }>;
}) {
  const unwrappedParams = use(params);
  const role = unwrappedParams.role as AppRole;
  const slug = unwrappedParams.slug || [];
  const pathPart = slug.join("/");

  if (!roleLabels[role]) {
    notFound();
  }

  const { title, component: Component } = useMemo(() => {
    switch (role) {
      case "customer":
        switch (pathPart) {
          case "": return { title: "Dashboard", component: <CustomerDashboardPage /> };
          case "requirements": return { title: "Requirements", component: <RequirementIntakePage role="customer" /> };
          case "lighting": return { title: "Lighting Visualizer", component: <LightingVisualizerPage role="customer" /> };
          case "electricians": return { title: "Electricians Directory", component: <DirectoryPage roles={[USER_ROLE.ELECTRICIAN]} /> };
          case "architects": return { title: "Architects Directory", component: <DirectoryPage roles={[USER_ROLE.ARCHITECT]} /> };
          case "handymen": return { title: "Handymen & Trades", component: <DirectoryPage roles={[USER_ROLE.ELECTRICIAN, USER_ROLE.POP_MAN, USER_ROLE.CARPENTER, USER_ROLE.PAINTER, USER_ROLE.TILES_MAN, USER_ROLE.PLUMBER]} /> };
          case "suppliers": return { title: "Suppliers", component: <DirectoryPage roles={[USER_ROLE.SUPPLIER]} /> };
          case "sites": return { title: "Sites", component: <CustomerSitesPage /> };
          case "tips/electrical": return { title: "Electrical Tips", component: <TipsPage category="electrical_tips" /> };
          case "tips/home": return { title: "Home Tips", component: <TipsPage category="home_tips" /> };
          case "budget": return { title: "Budget Tracker", component: <CustomerBudgetPage /> };
          case "finance": return { title: "Finance Facility", component: <CustomerFinancePage /> };
          case "wallet": return { title: "Wallet", component: <CustomerWalletPage /> };
          case "savings": return { title: "Savings Plans", component: <CustomerSavingsPage /> };
          case "referrals": return { title: "Referrals", component: <CustomerReferralsPage /> };
          case "approvals": return { title: "Items on Approval", component: <CustomerApprovalsPage /> };
          case "notes": return { title: "Project Notes", component: <ProjectNotesPage role="customer" /> };
          default: return { title: "Not Found", component: null };
        }
      case "electrician":
        switch (pathPart) {
          case "": return { title: "Dashboard", component: <ElectricianDashboardPage /> };
          case "requirements": return { title: "Requirements", component: <RequirementIntakePage role="electrician" /> };
          case "projects/new": return { title: "New Projects", component: <ElectricianProjectsPage mode="new" /> };
          case "projects/market": return { title: "Assigned to Others", component: <ElectricianProjectsPage mode="market" /> };
          case "projects/ongoing": return { title: "Ongoing Projects", component: <ElectricianProjectsPage mode="ongoing" /> };
          case "materials": return { title: "Material Tracker", component: <ElectricianMaterialsPage /> };
          case "notes": return { title: "Project Notes", component: <ProjectNotesPage role="electrician" /> };
          default: return { title: "Not Found", component: null };
        }
      case "architect":
        switch (pathPart) {
          case "": return { title: "Dashboard", component: <ArchitectDashboardPage /> };
          case "requirements": return { title: "Requirements", component: <RequirementIntakePage role="architect" /> };
          case "lighting": return { title: "Lighting Visualizer", component: <LightingVisualizerPage role="architect" /> };
          case "projects/new": return { title: "New Projects", component: <ArchitectProjectsPage mode="new" /> };
          case "projects/ongoing": return { title: "Ongoing Projects", component: <ArchitectProjectsPage mode="ongoing" /> };
          case "materials": return { title: "Material Tracker", component: <ArchitectMaterialsPage /> };
          case "requests": return { title: "Product Requests", component: <ArchitectProductRequestsPage /> };
          case "notes": return { title: "Project Notes", component: <ProjectNotesPage role="architect" /> };
          default: return { title: "Not Found", component: null };
        }
      case "admin":
        switch (pathPart) {
          case "": return { title: "Dashboard", component: <AdminDashboardPage /> };
          case "requirements": return { title: "Requirements Queue", component: <AdminRequirementsPage /> };
          case "lighting": return { title: "Lighting Leads", component: <LightingVisualizerPage role="admin" /> };
          case "users": return { title: "Users & Verification", component: <AdminUsersPage /> };
          case "assignments": return { title: "Site Assignments", component: <AdminAssignmentsPage /> };
          case "orders": return { title: "Orders", component: <AdminOrdersPage /> };
          case "workflows": return { title: "Workflow Center", component: <AdminWorkflowHubPage /> };
          case "products": return { title: "Products & Inventory", component: <AdminProductsPage /> };
          case "catalog": return { title: "Categories & Brands", component: <AdminCatalogPage /> };
          case "fintech": return { title: "Wallets, Savings & Referrals", component: <AdminFintechPage /> };
          case "requests": return { title: "Product Requests", component: <AdminProductRequestsPage /> };
          case "substitutions": return { title: "Substitutions", component: <AdminSubstitutionsPage /> };
          case "content": return { title: "Tips Content", component: <AdminContentPage /> };
          case "notes": return { title: "Project Notes", component: <ProjectNotesPage role="admin" /> };
          default: return { title: "Not Found", component: null };
        }
      case "supplier":
        switch (pathPart) {
          case "": return { title: "Dashboard", component: <SupplierDashboardPage /> };
          default: return { title: "Not Found", component: null };
        }
      default:
        return { title: "Not Found", component: null };
    }
  }, [role, pathPart]);

  if (!Component) {
    notFound();
  }

  return (
    <AppFrame role={role} title={title}>
      <div className="fade-in">
        {Component}
      </div>
    </AppFrame>
  );
}
