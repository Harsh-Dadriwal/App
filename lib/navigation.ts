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
    { href: "/customer/selections", label: "Selections from my Electrician", shortLabel: "Selections" },
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
    { href: "/electrician/selections", label: "Product Selections", shortLabel: "Selections" },
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
    { href: "/architect/selections", label: "Product Selections", shortLabel: "Selections" },
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
    { href: "/admin/selections", label: "Product Selections", shortLabel: "Selections" },
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

export type NavIconName =
  | "home" | "bag" | "box" | "file" | "list" | "tool" | "users" | "pin" | "chart"
  | "wallet" | "gift" | "note" | "plus" | "briefcase" | "award" | "tag" | "store";

/** Menu sections, in the order they appear. */
export const NAV_GROUPS = ["Overview", "Shop & orders", "Work & sites", "Money & rewards", "People & setup"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

// Keyed by the last part of the link (e.g. /customer/orders -> orders), so every role shares it.
const NAV_META: Record<string, { icon: NavIconName; group: NavGroup }> = {
  dashboard: { icon: "home", group: "Overview" },
  shop: { icon: "bag", group: "Shop & orders" },
  orders: { icon: "box", group: "Shop & orders" },
  quotations: { icon: "file", group: "Shop & orders" },
  selections: { icon: "list", group: "Shop & orders" },
  "price-list": { icon: "tag", group: "Shop & orders" },
  "service-requests": { icon: "tool", group: "Work & sites" },
  new: { icon: "plus", group: "Work & sites" },
  market: { icon: "store", group: "Work & sites" },
  ongoing: { icon: "briefcase", group: "Work & sites" },
  sites: { icon: "pin", group: "Work & sites" },
  notes: { icon: "note", group: "Work & sites" },
  wallet: { icon: "wallet", group: "Money & rewards" },
  savings: { icon: "wallet", group: "Money & rewards" },
  budget: { icon: "chart", group: "Money & rewards" },
  referrals: { icon: "gift", group: "Money & rewards" },
  incentives: { icon: "award", group: "Money & rewards" },
  fintech: { icon: "wallet", group: "Money & rewards" },
  credit: { icon: "wallet", group: "Money & rewards" },
  professionals: { icon: "users", group: "People & setup" },
  handymen: { icon: "tool", group: "People & setup" },
  suppliers: { icon: "box", group: "People & setup" },
  users: { icon: "users", group: "People & setup" }
};

function navMeta(href: string, role: AppRole) {
  const last = href.split("/").filter(Boolean).pop() ?? "";
  return href === `/${role}` ? NAV_META.dashboard : NAV_META[last] ?? { icon: "list" as NavIconName, group: "Work & sites" as NavGroup };
}

/** The menu for a role split into labelled sections, each item carrying its icon. */
export function getRoleNavGroups(role: AppRole) {
  const items = getRoleNav(role).map((item) => ({ ...item, ...navMeta(item.href, role) }));
  return NAV_GROUPS.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter((section) => section.items.length);
}
