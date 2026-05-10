export type {
  ActiveTenant,
  AppRole,
  TenantMembership,
  UserProfile
} from "@mahalaxmi/core/types/domain";

export type AuthSession = {
  user: {
    id: string;
  };
} | null;
