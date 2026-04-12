import type { AppRole } from "@/lib/app-types";

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  customer: "Customer",
  electrician: "Electrician",
  architect: "Architect"
};

export const authRoleOptions = [
  {
    value: "customer",
    label: "Customer",
    description: "Create sites, approve materials, track budget, and manage project purchases.",
    signupAllowed: true
  },
  {
    value: "electrician",
    label: "Electrician",
    description: "Bid on projects, draft technical lists, and track material execution.",
    signupAllowed: true
  },
  {
    value: "architect",
    label: "Architect",
    description: "Review materials, add aesthetic items, and manage approval flows.",
    signupAllowed: true
  },
  {
    value: "admin",
    label: "Admin",
    description: "Operations, verification, inventory, substitutions, and supply control.",
    signupAllowed: false
  }
] as const;

export const roleNav: Record<
  AppRole,
  Array<{ href: string; label: string; shortLabel?: string }>
> = {
  customer: [
    { href: "/customer", label: "Dashboard" },
    { href: "/customer/electricians", label: "Electricians" },
    { href: "/customer/architects", label: "Architects" },
    { href: "/customer/sites", label: "Sites" },
    { href: "/customer/tips/electrical", label: "Electrical Tips", shortLabel: "Elec Tips" },
    { href: "/customer/tips/home", label: "Home Tips" },
    { href: "/customer/budget", label: "Budget Tracker", shortLabel: "Budget" },
    { href: "/customer/finance", label: "Finance Facility", shortLabel: "Finance" },
    { href: "/customer/wallet", label: "Wallet", shortLabel: "Wallet" },
    { href: "/customer/savings", label: "Savings Plans", shortLabel: "Savings" },
    { href: "/customer/referrals", label: "Referrals", shortLabel: "Referrals" },
    { href: "/customer/approvals", label: "Items on Approval", shortLabel: "Approvals" },
    { href: "/customer/notes", label: "Project Notes", shortLabel: "Notes" }
  ],
  electrician: [
    { href: "/electrician", label: "Dashboard" },
    { href: "/electrician/projects/new", label: "New Projects" },
    { href: "/electrician/projects/market", label: "Assigned to Others", shortLabel: "Market" },
    { href: "/electrician/projects/ongoing", label: "Ongoing Projects", shortLabel: "Ongoing" },
    { href: "/electrician/materials", label: "Material Tracker", shortLabel: "Materials" },
    { href: "/electrician/notes", label: "Project Notes", shortLabel: "Notes" }
  ],
  architect: [
    { href: "/architect", label: "Dashboard" },
    { href: "/architect/projects/new", label: "New Projects" },
    { href: "/architect/projects/ongoing", label: "Ongoing Projects", shortLabel: "Ongoing" },
    { href: "/architect/materials", label: "Material Tracker", shortLabel: "Materials" },
    { href: "/architect/requests", label: "Product Requests", shortLabel: "Requests" },
    { href: "/architect/notes", label: "Project Notes", shortLabel: "Notes" }
  ],
  admin: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/users", label: "Users & Verification", shortLabel: "Users" },
    { href: "/admin/assignments", label: "Site Assignments", shortLabel: "Assignments" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/products", label: "Products & Inventory", shortLabel: "Products" },
    { href: "/admin/catalog", label: "Categories & Brands", shortLabel: "Catalog" },
    { href: "/admin/fintech", label: "Wallets, Savings & Referrals", shortLabel: "Fintech" },
    { href: "/admin/requests", label: "Product Requests", shortLabel: "Requests" },
    { href: "/admin/substitutions", label: "Substitutions" },
    { href: "/admin/content", label: "Tips Content", shortLabel: "Content" },
    { href: "/admin/notes", label: "Project Notes", shortLabel: "Notes" }
  ]
};
