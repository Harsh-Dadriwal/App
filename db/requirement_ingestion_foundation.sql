BEGIN;

CREATE TABLE IF NOT EXISTS public.requirement_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source_channel character varying(50) NOT NULL DEFAULT 'manual_upload',
  status character varying(40) NOT NULL DEFAULT 'queued',
  review_status character varying(40) NOT NULL DEFAULT 'pending',
  input_language character varying(20),
  overall_confidence numeric(5,2),
  notes text,
  generated_site_order_id uuid REFERENCES public.site_orders(id) ON DELETE SET NULL,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.requirement_batch_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_batch_id uuid NOT NULL REFERENCES public.requirement_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_type character varying(40) NOT NULL,
  mime_type character varying(120),
  original_filename character varying(255),
  storage_bucket character varying(255),
  storage_key text,
  public_url text,
  page_count integer,
  raw_text text,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.requirement_batch_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_batch_id uuid NOT NULL REFERENCES public.requirement_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stage character varying(50) NOT NULL,
  status character varying(30) NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  worker_name character varying(120),
  error_message text,
  input_payload jsonb,
  output_payload jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.requirement_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_batch_id uuid NOT NULL REFERENCES public.requirement_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.requirement_batch_sources(id) ON DELETE SET NULL,
  source_page integer,
  source_line_number integer,
  raw_text text NOT NULL,
  normalized_text text,
  extracted_quantity numeric(14,2),
  extracted_unit character varying(40),
  extracted_brand character varying(120),
  extracted_specifications text,
  extracted_dimensions character varying(120),
  extracted_category character varying(120),
  matched_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  match_confidence numeric(5,2),
  extraction_confidence numeric(5,2),
  review_status character varying(40) NOT NULL DEFAULT 'pending',
  review_notes text,
  source_coordinates jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.requirement_batch_item_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_batch_item_id uuid NOT NULL REFERENCES public.requirement_batch_items(id) ON DELETE CASCADE,
  candidate_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  candidate_reason text,
  semantic_score numeric(5,2),
  fuzzy_score numeric(5,2),
  brand_score numeric(5,2),
  availability_score numeric(5,2),
  final_score numeric(5,2),
  is_substitute boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.requirement_batch_review_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_batch_id uuid NOT NULL REFERENCES public.requirement_batches(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.requirement_batch_items(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  action_type character varying(40) NOT NULL,
  old_value jsonb,
  new_value jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.requirement_batch_dictionaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  term character varying(120) NOT NULL,
  normalized_term character varying(120) NOT NULL,
  term_type character varying(50) NOT NULL,
  language_code character varying(10) NOT NULL DEFAULT 'mixed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requirement_batches_tenant_created
  ON public.requirement_batches (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requirement_batches_status
  ON public.requirement_batches (tenant_id, status, review_status);

CREATE INDEX IF NOT EXISTS idx_requirement_batch_sources_batch
  ON public.requirement_batch_sources (requirement_batch_id, created_at);

CREATE INDEX IF NOT EXISTS idx_requirement_batch_jobs_batch_stage
  ON public.requirement_batch_processing_jobs (requirement_batch_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requirement_batch_items_batch
  ON public.requirement_batch_items (requirement_batch_id, review_status, created_at);

CREATE INDEX IF NOT EXISTS idx_requirement_batch_items_match
  ON public.requirement_batch_items (tenant_id, matched_product_id, match_confidence);

CREATE INDEX IF NOT EXISTS idx_requirement_batch_candidates_item
  ON public.requirement_batch_item_candidates (requirement_batch_item_id, final_score DESC);

CREATE INDEX IF NOT EXISTS idx_requirement_batch_dictionary_term
  ON public.requirement_batch_dictionaries (tenant_id, term, normalized_term);

COMMIT;
