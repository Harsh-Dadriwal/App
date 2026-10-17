import { USER_ROLE, isRoleEnabled, type AppRole } from "@mahalaxmi/core/types/domain";

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  customer: "Customer",
  electrician: "Electrician",
  architect: "Architect",
  supplier: "Supplier",
  pop_man: "POP Contractor",
  carpenter: "Carpenter",
  painter: "Painter",
  tiles_man: "Tiling Contractor",
  plumber: "Plumber"
};

type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  /** Shown only while at least one of these roles is enabled (see ENABLED_ROLES). */
  showsRoles?: AppRole[];
};

const HANDYMAN_TRADES: AppRole[] = [USER_ROLE.POP_MAN, USER_ROLE.CARPENTER, USER_ROLE.PAINTER, USER_ROLE.TILES_MAN, USER_ROLE.PLUMBER];

export const roleNav: Record<AppRole, NavItem[]> = {
  customer: [
    { href: "/customer", label: "Dashboard" },
    { href: "/customer/shop", label: "Shop Products", shortLabel: "Shop" },
    { href: "/customer/orders", label: "My Orders", shortLabel: "Orders" },
    { href: "/customer/quotations", label: "Quotations", shortLabel: "Quotes" },
    { href: "/customer/service-requests", label: "Complaints & Installation", shortLabel: "Service" },
    { href: "/customer/professionals", label: "Electricians & Architects", shortLabel: "Experts" },
    { href: "/customer/handymen", label: "Handymen & Trades", shortLabel: "Handymen", showsRoles: HANDYMAN_TRADES },
    { href: "/customer/suppliers", label: "Suppliers", showsRoles: [USER_ROLE.SUPPLIER] },
    { href: "/customer/sites", label: "Sites" },
    { href: "/customer/budget", label: "Budget Tracker", shortLabel: "Budget" },
    { href: "/customer/wallet", label: "Wallet", shortLabel: "Wallet" },
    { href: "/customer/savings", label: "Savings Plans", shortLabel: "Savings" },
    { href: "/customer/referrals", label: "Referrals", shortLabel: "Referrals" },
    { href: "/customer/notes", label: "Project Notes", shortLabel: "Notes" }
  ],
  electrician: [
    { href: "/electrician", label: "Dashboard" },
    { href: "/electrician/shop", label: "Order Materials", shortLabel: "Shop" },
    { href: "/electrician/orders", label: "My Orders", shortLabel: "Orders" },
    { href: "/electrician/quotations", label: "Quotations", shortLabel: "Quotes" },
    { href: "/electrician/service-requests", label: "Service Requests", shortLabel: "Service" },
    { href: "/electrician/projects/new", label: "New Projects" },
    { href: "/electrician/projects/market", label: "Assigned to Others", shortLabel: "Market" },
    { href: "/electrician/projects/ongoing", label: "Ongoing Projects", shortLabel: "Ongoing" },
    { href: "/electrician/incentives", label: "Partner Incentives", shortLabel: "Incentives" },
    { href: "/electrician/notes", label: "Project Notes", shortLabel: "Notes" }
  ],
  architect: [
    { href: "/architect", label: "Dashboard" },
    { href: "/architect/shop", label: "Shop Products", shortLabel: "Shop" },
    { href: "/architect/orders", label: "My Orders", shortLabel: "Orders" },
    { href: "/architect/quotations", label: "Quotations", shortLabel: "Quotes" },
    { href: "/architect/projects/new", label: "New Projects" },
    { href: "/architect/projects/ongoing", label: "Ongoing Projects", shortLabel: "Ongoing" },
    { href: "/architect/incentives", label: "Partner Incentives", shortLabel: "Incentives" },
    { href: "/architect/notes", label: "Project Notes", shortLabel: "Notes" }
  ],
  supplier: [
    { href: "/supplier", label: "Dashboard" }
  ],
  pop_man: [
    { href: "/pop_man", label: "Dashboard" }
  ],
  carpenter: [
    { href: "/carpenter", label: "Dashboard" }
  ],
  painter: [
    { href: "/painter", label: "Dashboard" }
  ],
  tiles_man: [
    { href: "/tiles_man", label: "Dashboard" }
  ],
  plumber: [
    { href: "/plumber", label: "Dashboard" }
  ],
  admin: [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/orders", label: "Orders" },
    { href: "/admin/quotations", label: "Quotations", shortLabel: "Quotes" },
    { href: "/admin/service-requests", label: "Service Requests", shortLabel: "Service" },
    { href: "/admin/users", label: "Users & Verification", shortLabel: "Users" },
    { href: "/admin/price-list", label: "Price List & Stock", shortLabel: "Prices" },
    { href: "/admin/fintech", label: "Wallets, Savings & Referrals", shortLabel: "Fintech" },
    { href: "/admin/credit", label: "Contractor Credit", shortLabel: "Credit" },
    { href: "/admin/incentives", label: "Partner Incentives", shortLabel: "Incentives" },
    { href: "/admin/notes", label: "Project Notes", shortLabel: "Notes" }
  ]
};

/** The menu for a role, without items for roles that are switched off. */
export function getRoleNav(role: AppRole) {
  return (roleNav[role] ?? []).filter((item) => !item.showsRoles || item.showsRoles.some(isRoleEnabled));
}
