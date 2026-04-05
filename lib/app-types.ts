export type AppRole = "admin" | "customer" | "electrician" | "architect";

export type UserProfile = {
  id: string;
  auth_user_id?: string | null;
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

export type AuthSession = {
  user: {
    id: string;
  };
} | null;
