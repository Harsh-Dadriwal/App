export const USER_ROLE = {
  ADMIN: "admin",
  CUSTOMER: "customer",
  ELECTRICIAN: "electrician",
  ARCHITECT: "architect",
  SUPPLIER: "supplier",
  POP_MAN: "pop_man",
  CARPENTER: "carpenter",
  PAINTER: "painter",
  TILES_MAN: "tiles_man",
  PLUMBER: "plumber"
} as const;

export type AppRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const HANDYMAN_SERVICE_ROLES = [
  USER_ROLE.POP_MAN,
  USER_ROLE.CARPENTER,
  USER_ROLE.PAINTER,
  USER_ROLE.TILES_MAN,
  USER_ROLE.PLUMBER,
  USER_ROLE.ELECTRICIAN
] as const;

export type HandymanServiceRole = (typeof HANDYMAN_SERVICE_ROLES)[number];

export type UserProfile = {
  id: string;
  auth_user_id?: string | null;
  default_tenant_id?: string | null;
  username?: string | null;
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

export const TASK_STATUS = {
  OPEN: "OPEN",
  BIDDING_CLOSED: "BIDDING_CLOSED",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  EXPIRED: "EXPIRED"
} as const;

export type MaintenanceTaskStatus =
  (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const MAINTENANCE_TASK_STATUS = TASK_STATUS;

export const BID_STATUS = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED"
} as const;

export type BidStatus = (typeof BID_STATUS)[keyof typeof BID_STATUS];

export const REQUIREMENT_BATCH_STATUS = {
  UPLOADED: "uploaded",
  QUEUED: "queued",
  PROCESSING: "processing",
  AWAITING_REVIEW: "awaiting_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  GENERATED: "generated",
  FAILED: "failed"
} as const;

export type RequirementBatchStatus =
  (typeof REQUIREMENT_BATCH_STATUS)[keyof typeof REQUIREMENT_BATCH_STATUS];

export const REQUIREMENT_SOURCE_TYPE = {
  XLSX: "xlsx",
  CSV: "csv",
  PDF: "pdf",
  IMAGE: "image",
  HANDWRITTEN_IMAGE: "handwritten_image",
  WHATSAPP_SCREENSHOT: "whatsapp_screenshot",
  PLAIN_TEXT: "plain_text",
  MIXED_NOTE: "mixed_note"
} as const;

export type RequirementSourceType =
  (typeof REQUIREMENT_SOURCE_TYPE)[keyof typeof REQUIREMENT_SOURCE_TYPE];

export const REQUIREMENT_REVIEW_STATUS = {
  PENDING: "pending",
  AUTO_MATCHED: "auto_matched",
  NEEDS_REVIEW: "needs_review",
  APPROVED: "approved",
  REJECTED: "rejected"
} as const;

export type RequirementReviewStatus =
  (typeof REQUIREMENT_REVIEW_STATUS)[keyof typeof REQUIREMENT_REVIEW_STATUS];

export type RequirementBatch = {
  id: string;
  tenant_id: string;
  site_id: string | null;
  created_by: string | null;
  source_channel: string;
  status: RequirementBatchStatus;
  review_status: RequirementReviewStatus;
  input_language: string | null;
  overall_confidence: number | null;
  generated_site_order_id?: string | null;
  processing_started_at?: string | null;
  processing_completed_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type RequirementBatchSource = {
  id: string;
  requirement_batch_id: string;
  tenant_id: string;
  source_type: RequirementSourceType;
  mime_type: string | null;
  original_filename: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  public_url: string | null;
  page_count?: number | null;
  raw_text: string | null;
  metadata_json?: Record<string, unknown> | null;
  created_at: string;
};

export type RequirementBatchItem = {
  id: string;
  requirement_batch_id: string;
  tenant_id: string;
  source_id: string | null;
  source_page: number | null;
  source_line_number: number | null;
  raw_text: string;
  normalized_text: string | null;
  extracted_quantity: number | null;
  extracted_unit: string | null;
  extracted_brand: string | null;
  extracted_specifications: string | null;
  extracted_dimensions: string | null;
  extracted_category: string | null;
  matched_product_id: string | null;
  match_confidence: number | null;
  extraction_confidence: number | null;
  review_status: RequirementReviewStatus;
  review_notes?: string | null;
  source_coordinates?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RequirementBatchItemCandidate = {
  id: string;
  requirement_batch_item_id: string;
  candidate_product_id: string | null;
  candidate_reason: string | null;
  semantic_score: number | null;
  fuzzy_score: number | null;
  brand_score: number | null;
  availability_score: number | null;
  final_score: number | null;
  is_substitute: boolean;
  created_at: string;
};

export const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  customer: "Customer",
  electrician: "Electrician",
  architect: "Architect",
  supplier: "Supplier",
  pop_man: "POP Man",
  carpenter: "Carpenter",
  painter: "Painter",
  tiles_man: "Tiles Man",
  plumber: "Plumber"
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
