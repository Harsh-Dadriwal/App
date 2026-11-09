export type RequestActor = {
  authUserId: string;
  appUserId: string | null;
  role: string | null;
  defaultTenantId: string | null;
  /** The signed-in person's profile row, as read by the auth guard. */
  profile?: Record<string, any> | null;
};
