import { isRoleEnabled, type AppRole } from "@mahalaxmi/core/types/domain";

export const ELECTRICIAN_BID_STEPS = [
  { label: "Project & offer", description: "Site and bid amount" },
  { label: "Details", description: "Timeline and notes" }
] as const;

// Roles switched off in ENABLED_ROLES are left out, so admins cannot assign them for now.
export const ADMIN_MANAGED_USER_ROLES: AppRole[] = ([
  "customer",
  "electrician",
  "architect",
  "pop_man",
  "carpenter",
  "painter",
  "tiles_man",
  "plumber",
  "supplier"
] as AppRole[]).filter(isRoleEnabled);
