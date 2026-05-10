export type BackendEnvelope<T> = {
  data: T;
};

export type BackendResult<T> = {
  data: T | null;
  error: string | null;
};

export type AuthProfileDto = {
  id: string;
  auth_user_id?: string | null;
  default_tenant_id?: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  city: string | null;
  state: string | null;
  company_name: string | null;
  verification_status: string;
  is_admin_verified: boolean;
};

export type TenantBrandingDto = {
  app_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
};

export type TenantMembershipDto = {
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
  branding?: TenantBrandingDto | null;
};

export type SwitchTenantRequestDto = {
  tenantId: string;
};

export type CustomerDecisionRequestDto = {
  target_order_item_id: string;
  approve: boolean;
  note_text?: string | null;
};

export type SubstituteResponseRequestDto = {
  suggestion_id: string;
  accept_choice: boolean;
};

export type ArchitectReviewRequestDto = {
  target_order_item_id: string;
  approve: boolean;
  note_text?: string | null;
};

export type SiteOrderTransitionRequestDto = {
  target_site_order_id: string;
  target_transition_key: string;
  note_text?: string | null;
  event_payload?: Record<string, unknown> | null;
  target_source_module?: string | null;
};

export type MarkSuppliedRequestDto = {
  target_order_item_id: string;
  supplied_qty: number;
  note_text?: string | null;
};

export type SuggestSubstituteRequestDto = {
  original_item_id: string;
  suggested_product: string;
  reason_text?: string | null;
};

export type VerifyProfessionalRequestDto = {
  target_user_id: string;
  approve: boolean;
  admin_note?: string | null;
};

export type PostWalletEntryRequestDto = Record<string, unknown>;
export type EnsureWalletAccountRequestDto = Record<string, unknown>;
export type PaySavingsInstallmentRequestDto = Record<string, unknown>;
export type ResolveReferralRewardRequestDto = Record<string, unknown>;

export type RazorpayCreateOrderRequestDto = {
  amount: number | string;
  receipt?: string;
  notes?: Record<string, string>;
};

export type RazorpayCreateOrderResponseDto = {
  id: string;
  amount: number;
  currency: string;
  keyId: string;
};

export type RazorpayVerifyPaymentRequestDto = {
  orderId: string;
  paymentId: string;
  signature: string;
};

export type RazorpayVerifyPaymentResponseDto = {
  isValid: boolean;
};

export type WalletReconciliationRowDto = {
  wallet_account_id: string;
  tenant_id: string;
  wallet_user_id: string;
  wallet_balance: number;
  snapshot_balance: number;
  ledger_balance: number;
  ledger_snapshot_drift: number;
  wallet_snapshot_drift: number;
  last_ledger_entry_id?: string | null;
};
