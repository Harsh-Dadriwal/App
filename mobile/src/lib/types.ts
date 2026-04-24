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
  branding?: {
    app_name?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
  } | null;
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
