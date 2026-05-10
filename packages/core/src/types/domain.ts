export type AppRole = "admin" | "customer" | "electrician" | "architect" | "supplier";

export type UserProfile = {
  id: string;
  auth_user_id?: string | null;
  default_tenant_id?: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRole;
  city: string | null;
  state: string | null;
  company_name: string | null;
  verification_status: string;
  is_admin_verified: boolean;
  credit_limit?: number;
  credit_balance?: number;
  credit_score?: number;
};

export type TenantBranding = {
  app_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
};

export type TenantMembership = {
  id: string;
  tenant_id: string;
  role: string;
  is_default: boolean;
  is_active: boolean;
  tenant?: {
    id: string;
    slug: string;
    display_name: string;
    status: string;
  } | null;
  branding?: TenantBranding | null;
};

export type ActiveTenant = {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  membership_role: string;
  app_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
};

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  customer: "Customer",
  electrician: "Electrician",
  architect: "Architect",
  supplier: "Supplier"
};

export function resolveActiveTenant(
  profile: UserProfile | null,
  memberships: TenantMembership[]
): ActiveTenant | null {
  const preferredTenantId =
    profile?.default_tenant_id ||
    memberships.find((membership) => membership.is_default)?.tenant_id ||
    memberships[0]?.tenant_id ||
    null;

  const activeMembership =
    memberships.find((membership) => membership.tenant_id === preferredTenantId) ??
    memberships[0] ??
    null;

  if (!activeMembership?.tenant) {
    return null;
  }

  return {
    id: activeMembership.tenant.id,
    slug: activeMembership.tenant.slug,
    display_name: activeMembership.tenant.display_name,
    status: activeMembership.tenant.status,
    membership_role: activeMembership.role,
    app_name: activeMembership.branding?.app_name ?? activeMembership.tenant.display_name,
    logo_url: activeMembership.branding?.logo_url ?? null,
    primary_color: activeMembership.branding?.primary_color ?? null,
    secondary_color: activeMembership.branding?.secondary_color ?? null,
    accent_color: activeMembership.branding?.accent_color ?? null
  };
}
