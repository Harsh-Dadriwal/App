-- =====================================================================
-- COMPLETE DATABASE REBUILD SCRIPT
-- =====================================================================
-- Generated on 2026-07-26 from the current db/ folder state.
--
-- Purpose:
-- - Start from the current full project rebuild base
-- - Layer in newer additive SQL that is not fully folded into that base
-- - Give you one file to run when rebuilding from scratch
--
-- Recommended usage:
-- 1. Run this in a fresh Supabase project / clean database
-- 2. Run as a single script in SQL Editor
-- 3. If your environment already contains conflicting old objects/data,
--    review destructive DROP statements in the base rebuild first
-- =====================================================================

BEGIN;


-- =====================================================================
-- SOURCE: db/full_project_rebuild.sql
-- =====================================================================


CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TYPE IF EXISTS public.user_role CASCADE;
CREATE TYPE public.user_role AS ENUM ('admin', 'customer', 'electrician', 'architect', 'supplier', 'pop_man', 'carpenter', 'painter', 'tiles_man', 'plumber');
DROP TYPE IF EXISTS public.user_status CASCADE;
CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'blocked');
DROP TYPE IF EXISTS public.verification_status CASCADE;
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'rejected');
DROP TYPE IF EXISTS public.site_status CASCADE;
CREATE TYPE public.site_status AS ENUM ('draft', 'open_for_bidding', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled');
DROP TYPE IF EXISTS public.bid_status CASCADE;
CREATE TYPE public.bid_status AS ENUM ('submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn');
DROP TYPE IF EXISTS public.assignment_role CASCADE;
CREATE TYPE public.assignment_role AS ENUM ('electrician', 'architect');
DROP TYPE IF EXISTS public.assignment_status CASCADE;
CREATE TYPE public.assignment_status AS ENUM ('active', 'removed', 'completed');
DROP TYPE IF EXISTS public.inventory_stock_status CASCADE;
CREATE TYPE public.inventory_stock_status AS ENUM ('in_stock', 'out_of_stock', 'limited');
DROP TYPE IF EXISTS public.requirement_source CASCADE;
CREATE TYPE public.requirement_source AS ENUM ('electrician', 'architect', 'admin', 'customer');
DROP TYPE IF EXISTS public.approval_mode CASCADE;
CREATE TYPE public.approval_mode AS ENUM ('architect_then_customer', 'customer_only');
DROP TYPE IF EXISTS public.order_item_status CASCADE;
CREATE TYPE public.order_item_status AS ENUM (
  'draft_by_electrician',
  'draft_by_architect',
  'pending_architect_approval',
  'pending_customer_approval',
  'approved_pending_shop_confirmation',
  'approved_pending_supply',
  'partially_supplied',
  'supplied',
  'rejected_by_architect',
  'rejected_by_customer',
  'substitute_suggested',
  'substitute_accepted',
  'substitute_rejected',
  'cancelled'
);
DROP TYPE IF EXISTS public.substitute_status CASCADE;
CREATE TYPE public.substitute_status AS ENUM ('suggested', 'accepted', 'rejected', 'expired');
DROP TYPE IF EXISTS public.order_status CASCADE;
CREATE TYPE public.order_status AS ENUM ('draft', 'awaiting_approval', 'partially_approved', 'confirmed', 'processing', 'partially_supplied', 'supplied', 'cancelled');
DROP TYPE IF EXISTS public.finance_application_status CASCADE;
CREATE TYPE public.finance_application_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'closed');
DROP TYPE IF EXISTS public.content_category CASCADE;
CREATE TYPE public.content_category AS ENUM ('electrical_tips', 'home_tips');
DROP TYPE IF EXISTS public.notification_type CASCADE;
CREATE TYPE public.notification_type AS ENUM ('general', 'approval_requested', 'approval_completed', 'substitute_suggested', 'substitute_response', 'bid_update', 'order_update', 'finance_update');
DROP TYPE IF EXISTS public.product_request_status CASCADE;
CREATE TYPE public.product_request_status AS ENUM ('submitted', 'reviewing', 'matched', 'ordered', 'fulfilled', 'rejected');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TABLE IF EXISTS public.users CASCADE;
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  username VARCHAR(24) NOT NULL,
  role public.user_role NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255) UNIQUE,
  password_hash TEXT,
  status public.user_status NOT NULL DEFAULT 'active',
  verification_status public.verification_status NOT NULL DEFAULT 'pending',
  is_admin_verified BOOLEAN NOT NULL DEFAULT FALSE,
  company_name VARCHAR(150),
  gst_number VARCHAR(30),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  country VARCHAR(100) DEFAULT 'India',
  profile_photo_url TEXT,
  notes TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_users_auth_user_id ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON public.users (lower(username));

CREATE OR REPLACE FUNCTION public.normalize_username(raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    regexp_replace(lower(coalesce(raw_value, '')), '[^a-z0-9._]+', '', 'g'),
    24
  )
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(raw_value, ''), '[^0-9+]+', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.make_unique_username(base_username text, current_user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  sanitized_base text;
  candidate text;
  suffix integer := 0;
BEGIN
  sanitized_base := NULLIF(public.normalize_username(base_username), '');

  IF sanitized_base IS NULL THEN
    sanitized_base := 'user';
  END IF;

  IF length(sanitized_base) < 3 THEN
    sanitized_base := rpad(sanitized_base, 3, 'x');
  END IF;

  LOOP
    candidate := CASE
      WHEN suffix = 0 THEN sanitized_base
      ELSE left(sanitized_base, greatest(1, 24 - length(suffix::text) - 1)) || '_' || suffix::text
    END;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.users
      WHERE lower(coalesce(username, '')) = lower(candidate)
        AND (current_user_id IS NULL OR id <> current_user_id)
    );

    suffix := suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_public_user_identity_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_username text;
  normalized_email text;
  normalized_phone text;
BEGIN
  normalized_username := NULLIF(public.normalize_username(NEW.username), '');
  normalized_email := NULLIF(lower(trim(coalesce(NEW.email, ''))), '');
  normalized_phone := NULLIF(public.normalize_phone(NEW.phone), '');

  IF normalized_username IS NULL THEN
    RAISE EXCEPTION 'Username is required';
  END IF;

  NEW.username := normalized_username;
  NEW.email := normalized_email;
  NEW.phone := normalized_phone;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(username) = normalized_username
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Username already exists';
  END IF;

  IF normalized_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = normalized_email
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Email already exists';
  END IF;

  IF normalized_phone IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users
    WHERE public.normalize_phone(phone) = normalized_phone
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Phone already exists';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_identity_uniqueness ON public.users;
CREATE TRIGGER trg_users_identity_uniqueness
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_public_user_identity_uniqueness();

DROP TABLE IF EXISTS public.user_professional_profiles CASCADE;
CREATE TABLE public.user_professional_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  profession_title VARCHAR(100),
  years_of_experience INTEGER CHECK (years_of_experience >= 0),
  license_number VARCHAR(100),
  service_radius_km NUMERIC(10,2) CHECK (service_radius_km >= 0),
  bio TEXT,
  rating_avg NUMERIC(3,2) DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP SEQUENCE IF EXISTS public.site_code_seq CASCADE;
CREATE SEQUENCE IF NOT EXISTS public.site_code_seq START 1000;

DROP TABLE IF EXISTS public.sites CASCADE;
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  site_code VARCHAR(30) NOT NULL UNIQUE,
  site_name VARCHAR(150) NOT NULL,
  project_type VARCHAR(100),
  site_address_line1 VARCHAR(255) NOT NULL,
  site_address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  area_sqft NUMERIC(12,2) CHECK (area_sqft >= 0),
  architect_required BOOLEAN NOT NULL DEFAULT TRUE,
  approval_mode public.approval_mode NOT NULL DEFAULT 'architect_then_customer',
  estimated_budget NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (estimated_budget >= 0),
  actual_spend NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (actual_spend >= 0),
  status public.site_status NOT NULL DEFAULT 'draft',
  description TEXT,
  start_date DATE,
  expected_end_date DATE,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.site_assignments CASCADE;
CREATE TABLE public.site_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  role public.assignment_role NOT NULL,
  status public.assignment_status NOT NULL DEFAULT 'active',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, user_id, role)
);

DROP TABLE IF EXISTS public.project_bids CASCADE;
CREATE TABLE public.project_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  bidder_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  bidder_role public.assignment_role NOT NULL,
  bid_amount NUMERIC(14,2) NOT NULL CHECK (bid_amount >= 0),
  notes TEXT,
  estimated_days INTEGER CHECK (estimated_days IS NULL OR estimated_days > 0),
  status public.bid_status NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (site_id, bidder_user_id, bidder_role)
);

DROP TABLE IF EXISTS public.product_categories CASCADE;
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_product_categories_name_lower ON public.product_categories (LOWER(name));

DROP TABLE IF EXISTS public.product_brands CASCADE;
CREATE TABLE public.product_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.product_categories(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, slug)
);

CREATE UNIQUE INDEX uq_product_brands_category_name_lower ON public.product_brands (category_id, LOWER(name));

DROP TABLE IF EXISTS public.products CASCADE;
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.product_categories(id) ON DELETE RESTRICT,
  brand_id UUID NOT NULL REFERENCES public.product_brands(id) ON DELETE RESTRICT,
  item_name VARCHAR(150) NOT NULL,
  sku VARCHAR(80) NOT NULL UNIQUE,
  hsn_code VARCHAR(20),
  color VARCHAR(50),
  specification VARCHAR(255),
  unit VARCHAR(30) NOT NULL,
  pack_size NUMERIC(12,2) CHECK (pack_size IS NULL OR pack_size > 0),
  base_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  mrp NUMERIC(14,2) CHECK (mrp IS NULL OR mrp >= 0),
  stock_status public.inventory_stock_status NOT NULL DEFAULT 'in_stock',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_approved_for_sale BOOLEAN NOT NULL DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.product_inventory CASCADE;
CREATE TABLE public.product_inventory (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  available_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
  reserved_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  reorder_level NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.site_orders CASCADE;
CREATE TABLE public.site_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  order_number VARCHAR(40) NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  electrician_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  architect_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status public.order_status NOT NULL DEFAULT 'draft',
  subtotal_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  remarks TEXT,
  confirmed_at TIMESTAMPTZ,
  supplied_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.order_items CASCADE;
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_order_id UUID NOT NULL REFERENCES public.site_orders(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  source public.requirement_source NOT NULL,
  source_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  parent_order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  approval_mode public.approval_mode NOT NULL,
  requires_architect_approval BOOLEAN NOT NULL DEFAULT TRUE,
  item_name_snapshot VARCHAR(150) NOT NULL,
  category_name_snapshot VARCHAR(100),
  brand_name_snapshot VARCHAR(100),
  sku_snapshot VARCHAR(80),
  unit_snapshot VARCHAR(30) NOT NULL,
  quantity_required NUMERIC(14,2) NOT NULL CHECK (quantity_required > 0),
  quantity_approved NUMERIC(14,2) CHECK (quantity_approved IS NULL OR quantity_approved >= 0),
  quantity_supplied NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (quantity_supplied >= 0),
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_subtotal >= 0),
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  electrician_notes TEXT,
  architect_notes TEXT,
  customer_notes TEXT,
  admin_notes TEXT,
  status public.order_item_status NOT NULL,
  is_substitute BOOLEAN NOT NULL DEFAULT FALSE,
  substitute_for_order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  substitute_status public.substitute_status,
  architect_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  architect_reviewed_at TIMESTAMPTZ,
  customer_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  customer_reviewed_at TIMESTAMPTZ,
  shop_confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  shop_confirmed_at TIMESTAMPTZ,
  supplied_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  supplied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_order_items_qty_supplied_le_required CHECK (quantity_supplied <= quantity_required),
  CONSTRAINT chk_order_items_qty_approved CHECK (quantity_approved IS NULL OR quantity_approved <= quantity_required),
  CONSTRAINT chk_order_items_substitute_status CHECK (
    (is_substitute = FALSE AND substitute_status IS NULL)
    OR
    (is_substitute = TRUE AND substitute_status IS NOT NULL)
  )
);

DROP TABLE IF EXISTS public.order_item_status_history CASCADE;
CREATE TABLE public.order_item_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  from_status public.order_item_status,
  to_status public.order_item_status NOT NULL,
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  change_reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.substitute_suggestions CASCADE;
CREATE TABLE public.substitute_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  suggested_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  suggested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status public.substitute_status NOT NULL DEFAULT 'suggested',
  reason TEXT,
  customer_response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.budget_trackers CASCADE;
CREATE TABLE public.budget_trackers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL UNIQUE REFERENCES public.sites(id) ON DELETE CASCADE,
  initial_budget NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (initial_budget >= 0),
  revised_budget NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (revised_budget >= 0),
  approved_material_budget NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (approved_material_budget >= 0),
  actual_material_spend NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (actual_material_spend >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.finance_applications CASCADE;
CREATE TABLE public.finance_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  application_number VARCHAR(40) NOT NULL UNIQUE,
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
  approved_amount NUMERIC(14,2) CHECK (approved_amount IS NULL OR approved_amount >= 0),
  tenure_months INTEGER CHECK (tenure_months IS NULL OR tenure_months > 0),
  status public.finance_application_status NOT NULL DEFAULT 'draft',
  remarks TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.content_posts CASCADE;
CREATE TABLE public.content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.content_category NOT NULL,
  title VARCHAR(200) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  summary TEXT,
  body TEXT NOT NULL,
  thumbnail_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.notifications CASCADE;
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL DEFAULT 'general',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.audit_logs CASCADE;
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.product_requests CASCADE;
CREATE TABLE public.product_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  title VARCHAR(180) NOT NULL,
  preferred_category VARCHAR(120),
  preferred_brand VARCHAR(120),
  description TEXT NOT NULL,
  status public.product_request_status NOT NULL DEFAULT 'submitted',
  matched_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  admin_notes TEXT,
  ordered_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS public.site_notes CASCADE;
CREATE TABLE public.site_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipient_role public.user_role,
  recipient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Requirements Ingestion Foundation Tables
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

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_user_professional_profiles_updated_at BEFORE UPDATE ON public.user_professional_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON public.sites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_project_bids_updated_at BEFORE UPDATE ON public.project_bids FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_product_categories_updated_at BEFORE UPDATE ON public.product_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_product_brands_updated_at BEFORE UPDATE ON public.product_brands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_product_inventory_updated_at BEFORE UPDATE ON public.product_inventory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_site_orders_updated_at BEFORE UPDATE ON public.site_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_order_items_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_substitute_suggestions_updated_at BEFORE UPDATE ON public.substitute_suggestions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_budget_trackers_updated_at BEFORE UPDATE ON public.budget_trackers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_finance_applications_updated_at BEFORE UPDATE ON public.finance_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_content_posts_updated_at BEFORE UPDATE ON public.content_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_product_requests_updated_at BEFORE UPDATE ON public.product_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_site_notes_updated_at BEFORE UPDATE ON public.site_notes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- UX Polish: Automated Site Code Generation
CREATE OR REPLACE FUNCTION public.set_default_site_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.site_code IS NULL OR NEW.site_code = '' THEN
    NEW.site_code := 'SIT-' || nextval('public.site_code_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER trigger_set_default_site_code
BEFORE INSERT ON public.sites
FOR EACH ROW
EXECUTE FUNCTION public.set_default_site_code();

CREATE INDEX idx_sites_customer_id ON public.sites(customer_id);
CREATE INDEX idx_sites_status ON public.sites(status);
CREATE INDEX idx_site_assignments_site_id ON public.site_assignments(site_id);
CREATE INDEX idx_site_assignments_user_id ON public.site_assignments(user_id);
CREATE INDEX idx_project_bids_site_id ON public.project_bids(site_id);
CREATE INDEX idx_products_category_id ON public.products(category_id);
CREATE INDEX idx_products_brand_id ON public.products(brand_id);
CREATE INDEX idx_site_orders_site_id ON public.site_orders(site_id);
CREATE INDEX idx_order_items_site_id ON public.order_items(site_id);
CREATE INDEX idx_order_items_status ON public.order_items(status);
CREATE INDEX idx_budget_trackers_site_id ON public.budget_trackers(site_id);
CREATE INDEX idx_finance_applications_customer_id ON public.finance_applications(customer_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_product_requests_site_id ON public.product_requests(site_id);
CREATE INDEX idx_product_requests_status ON public.product_requests(status);
CREATE INDEX idx_site_notes_site_id ON public.site_notes(site_id);

CREATE OR REPLACE FUNCTION public.enforce_admin_limit()
RETURNS TRIGGER AS $$
DECLARE admin_count INTEGER;
BEGIN
  IF NEW.role = 'admin' AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM 'admin') THEN
    SELECT COUNT(*) INTO admin_count FROM public.users WHERE role = 'admin';
    IF admin_count >= 4 THEN
      RAISE EXCEPTION 'Maximum 4 admin accounts allowed';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER trg_users_admin_limit BEFORE INSERT OR UPDATE OF role ON public.users FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_limit();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
  safe_role public.user_role;
  matched_user_id uuid;
  target_tenant_id uuid;
  safe_username text;
  membership_role_type text;
BEGIN
  requested_role := lower(coalesce(NEW.raw_user_meta_data ->> 'role', 'customer'));
  safe_username := public.make_unique_username(
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
      NULLIF(split_part(lower(coalesce(NEW.email, '')), '@', 1), ''),
      NULLIF(public.normalize_username(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(public.normalize_phone(NEW.phone), ''),
      'user'
    )
  );

  safe_role := CASE
    WHEN requested_role = 'electrician' THEN 'electrician'::public.user_role
    WHEN requested_role = 'architect' THEN 'architect'::public.user_role
    WHEN requested_role = 'supplier' THEN 'supplier'::public.user_role
    WHEN requested_role = 'pop_man' THEN 'pop_man'::public.user_role
    WHEN requested_role = 'carpenter' THEN 'carpenter'::public.user_role
    WHEN requested_role = 'painter' THEN 'painter'::public.user_role
    WHEN requested_role = 'tiles_man' THEN 'tiles_man'::public.user_role
    WHEN requested_role = 'plumber' THEN 'plumber'::public.user_role
    ELSE 'customer'::public.user_role
  END;

  SELECT id
  INTO target_tenant_id
  FROM public.tenants
  WHERE slug = 'mahalaxmi-electricals'
  LIMIT 1;

  SELECT id
  INTO matched_user_id
  FROM public.users
  WHERE auth_user_id IS NULL
    AND (
      (NEW.email IS NOT NULL AND email IS NOT NULL AND lower(email) = lower(NEW.email))
      OR
      (NEW.phone IS NOT NULL AND phone IS NOT NULL AND public.normalize_phone(phone) = public.normalize_phone(NEW.phone))
    )
  ORDER BY created_at
  LIMIT 1;

  IF matched_user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      default_tenant_id = COALESCE(default_tenant_id, target_tenant_id),
      username = COALESCE(NULLIF(username, ''), safe_username),
      email = COALESCE(NULLIF(lower(NEW.email), ''), email),
      phone = COALESCE(NULLIF(public.normalize_phone(NEW.phone), ''), phone),
      full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name, 'User'),
      role = COALESCE(role, safe_role),
      last_login_at = NEW.last_sign_in_at,
      updated_at = now()
    WHERE id = matched_user_id;
  ELSE
    INSERT INTO public.users (
      auth_user_id,
      default_tenant_id,
      username,
      role,
      full_name,
      phone,
      email,
      status,
      verification_status,
      is_admin_verified,
      last_login_at
    )
    VALUES (
      NEW.id,
      target_tenant_id,
      safe_username,
      safe_role,
      COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
        split_part(COALESCE(NULLIF(NEW.email, ''), NULLIF(NEW.phone, ''), 'user'), '@', 1),
        'User'
      ),
      NULLIF(public.normalize_phone(NEW.phone), ''),
      NULLIF(lower(NEW.email), ''),
      'active',
      CASE
        WHEN safe_role = 'customer' THEN 'verified'::public.verification_status
        ELSE 'pending'::public.verification_status
      END,
      CASE
        WHEN safe_role = 'customer' THEN TRUE
        ELSE FALSE
      END,
      NEW.last_sign_in_at
    )
    ON CONFLICT (auth_user_id) DO NOTHING;

    SELECT id
    INTO matched_user_id
    FROM public.users
    WHERE auth_user_id = NEW.id
    LIMIT 1;
  END IF;

  IF matched_user_id IS NOT NULL AND target_tenant_id IS NOT NULL THEN
    SELECT c.udt_name
    INTO membership_role_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'tenant_memberships'
      AND c.column_name = 'role'
    LIMIT 1;

    EXECUTE format(
      'INSERT INTO public.tenant_memberships (
         tenant_id, user_id, role, is_default, is_active
       )
       VALUES ($1, $2, $3::public.%I, TRUE, TRUE)
       ON CONFLICT (tenant_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, is_default = TRUE, is_active = TRUE, updated_at = now()',
      COALESCE(membership_role_type, 'user_role')
    )
    USING target_tenant_id, matched_user_id, safe_role::text;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET email = COALESCE(NULLIF(NEW.email, ''), email),
      phone = COALESCE(NULLIF(NEW.phone, ''), phone),
      full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name),
      last_login_at = NEW.last_sign_in_at,
      updated_at = NOW()
  WHERE auth_user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated AFTER UPDATE OF email, phone, raw_user_meta_data, last_sign_in_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.sync_auth_user_profile();

CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id
  FROM public.users
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  ORDER BY CASE WHEN auth_user_id = auth.uid() THEN 0 ELSE 1 END
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = public.current_profile_id()
$$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(profile_row)
  FROM (
    SELECT
      id,
      auth_user_id,
      full_name,
      email,
      phone,
      role,
      city,
      state,
      company_name,
      verification_status,
      is_admin_verified
    FROM public.users
    WHERE auth_user_id = auth.uid() OR id = auth.uid()
    ORDER BY CASE WHEN auth_user_id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1
  ) AS profile_row
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.current_profile_role() = 'admin', FALSE)
$$;

CREATE OR REPLACE FUNCTION public.can_access_site(target_site_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sites s
    LEFT JOIN public.site_assignments sa ON sa.site_id = s.id AND sa.status = 'active'
    WHERE s.id = target_site_id
      AND (
        public.is_admin_user()
        OR s.customer_id = public.current_profile_id()
        OR sa.user_id = public.current_profile_id()
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_site_as_contractor(target_site_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = target_site_id
      AND sa.user_id = public.current_profile_id()
      AND sa.status = 'active'
      AND sa.role IN ('electrician', 'architect')
  ) OR public.is_admin_user()
$$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitute_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_trackers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_notes ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE POLICY users_select_self_or_verified_directory ON public.users
FOR SELECT TO authenticated
USING (
  auth.uid() = auth_user_id
  OR id = public.current_profile_id()
  OR public.is_admin_user()
  OR (
    role IN ('electrician', 'architect')
    AND status = 'active'
    AND verification_status = 'verified'
    AND is_admin_verified = TRUE
  )
);

CREATE POLICY users_update_self_or_admin ON public.users
FOR UPDATE TO authenticated
USING (id = public.current_profile_id() OR public.is_admin_user())
WITH CHECK (id = public.current_profile_id() OR public.is_admin_user());

CREATE POLICY professional_profiles_read ON public.user_professional_profiles
FOR SELECT TO authenticated
USING (
  user_id = public.current_profile_id()
  OR public.is_admin_user()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = user_professional_profiles.user_id
      AND u.verification_status = 'verified'
      AND u.is_admin_verified = TRUE
  )
);

CREATE POLICY professional_profiles_write_self ON public.user_professional_profiles
FOR ALL TO authenticated
USING (user_id = public.current_profile_id() OR public.is_admin_user())
WITH CHECK (user_id = public.current_profile_id() OR public.is_admin_user());

CREATE POLICY sites_access ON public.sites FOR SELECT TO authenticated USING (public.can_access_site(id));
CREATE POLICY sites_insert ON public.sites FOR INSERT TO authenticated WITH CHECK (public.is_admin_user() OR customer_id = public.current_profile_id());
CREATE POLICY sites_update ON public.sites FOR UPDATE TO authenticated USING (public.is_admin_user() OR customer_id = public.current_profile_id()) WITH CHECK (public.is_admin_user() OR customer_id = public.current_profile_id());

CREATE POLICY site_assignments_access ON public.site_assignments FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY site_assignments_admin_write ON public.site_assignments FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

CREATE POLICY project_bids_access ON public.project_bids FOR SELECT TO authenticated USING (public.is_admin_user() OR bidder_user_id = public.current_profile_id() OR public.can_access_site(site_id));
CREATE POLICY project_bids_write ON public.project_bids FOR ALL TO authenticated USING (public.is_admin_user() OR bidder_user_id = public.current_profile_id()) WITH CHECK (public.is_admin_user() OR bidder_user_id = public.current_profile_id());

CREATE POLICY product_categories_read ON public.product_categories FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY product_categories_admin_write ON public.product_categories FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY product_brands_read ON public.product_brands FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY product_brands_admin_write ON public.product_brands FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY products_read ON public.products FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY products_admin_write ON public.products FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE POLICY product_inventory_read ON public.product_inventory FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY product_inventory_admin_write ON public.product_inventory FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

CREATE POLICY site_orders_access ON public.site_orders FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY site_orders_write ON public.site_orders FOR ALL TO authenticated USING (public.is_admin_user() OR customer_id = public.current_profile_id()) WITH CHECK (public.is_admin_user() OR customer_id = public.current_profile_id());

CREATE POLICY order_items_access ON public.order_items FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY order_items_write ON public.order_items FOR ALL TO authenticated USING (public.can_manage_site_as_contractor(site_id) OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.customer_id = public.current_profile_id())) WITH CHECK (public.can_manage_site_as_contractor(site_id) OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.customer_id = public.current_profile_id()));

CREATE POLICY order_item_history_access ON public.order_item_status_history
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = order_item_id AND public.can_access_site(oi.site_id)));

CREATE POLICY substitute_access ON public.substitute_suggestions
FOR SELECT TO authenticated
USING (
  public.is_admin_user()
  OR customer_id = public.current_profile_id()
  OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.id = original_order_item_id AND public.can_access_site(oi.site_id))
);

CREATE POLICY substitute_write ON public.substitute_suggestions
FOR ALL TO authenticated
USING (public.is_admin_user() OR customer_id = public.current_profile_id())
WITH CHECK (public.is_admin_user() OR customer_id = public.current_profile_id());

CREATE POLICY budget_access ON public.budget_trackers FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY budget_write ON public.budget_trackers FOR ALL TO authenticated USING (public.is_admin_user() OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.customer_id = public.current_profile_id())) WITH CHECK (public.is_admin_user() OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.customer_id = public.current_profile_id()));

CREATE POLICY finance_access ON public.finance_applications FOR SELECT TO authenticated USING (public.is_admin_user() OR customer_id = public.current_profile_id());
CREATE POLICY finance_write ON public.finance_applications FOR ALL TO authenticated USING (public.is_admin_user() OR customer_id = public.current_profile_id()) WITH CHECK (public.is_admin_user() OR customer_id = public.current_profile_id());

CREATE POLICY content_read ON public.content_posts FOR SELECT TO authenticated USING (public.is_admin_user() OR is_published = TRUE);
CREATE POLICY content_write ON public.content_posts FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());

CREATE POLICY notifications_access ON public.notifications FOR SELECT TO authenticated USING (public.is_admin_user() OR user_id = public.current_profile_id());
CREATE POLICY notifications_write ON public.notifications FOR ALL TO authenticated USING (public.is_admin_user() OR user_id = public.current_profile_id()) WITH CHECK (public.is_admin_user() OR user_id = public.current_profile_id());

CREATE POLICY product_requests_access ON public.product_requests FOR SELECT TO authenticated USING (public.can_access_site(site_id) OR requested_by_user_id = public.current_profile_id());
CREATE POLICY product_requests_insert ON public.product_requests FOR INSERT TO authenticated WITH CHECK (public.is_admin_user() OR (requested_by_user_id = public.current_profile_id() AND public.current_profile_role() = 'architect' AND public.can_manage_site_as_contractor(site_id)));
CREATE POLICY product_requests_update ON public.product_requests FOR UPDATE TO authenticated USING (public.is_admin_user() OR requested_by_user_id = public.current_profile_id()) WITH CHECK (public.is_admin_user() OR requested_by_user_id = public.current_profile_id());
CREATE POLICY product_requests_delete ON public.product_requests FOR DELETE TO authenticated USING (public.is_admin_user() OR requested_by_user_id = public.current_profile_id());

CREATE POLICY site_notes_access ON public.site_notes
FOR SELECT TO authenticated
USING (
  public.can_access_site(site_id)
  AND (
    public.is_admin_user()
    OR sender_user_id = public.current_profile_id()
    OR recipient_user_id = public.current_profile_id()
    OR recipient_role IS NULL
    OR recipient_role = public.current_profile_role()
  )
);
CREATE POLICY site_notes_insert ON public.site_notes FOR INSERT TO authenticated WITH CHECK (sender_user_id = public.current_profile_id() AND public.can_access_site(site_id));
CREATE POLICY site_notes_update ON public.site_notes FOR UPDATE TO authenticated USING (public.is_admin_user() OR sender_user_id = public.current_profile_id()) WITH CHECK (public.is_admin_user() OR sender_user_id = public.current_profile_id());
CREATE POLICY site_notes_delete ON public.site_notes FOR DELETE TO authenticated USING (public.is_admin_user() OR sender_user_id = public.current_profile_id());

-- Supplier RLS Policies
DROP POLICY IF EXISTS product_inventory_supplier_update ON public.product_inventory;
CREATE POLICY product_inventory_supplier_update ON public.product_inventory
  FOR UPDATE TO authenticated
  USING (
    public.current_profile_role() = 'supplier'::public.user_role
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_inventory.product_id
        AND public.can_access_tenant(p.tenant_id)
    )
  )
  WITH CHECK (
    public.current_profile_role() = 'supplier'::public.user_role
    AND EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_inventory.product_id
        AND public.can_access_tenant(p.tenant_id)
    )
  );

DROP POLICY IF EXISTS site_orders_supplier_read ON public.site_orders;
CREATE POLICY site_orders_supplier_read ON public.site_orders FOR SELECT TO authenticated
  USING (
    public.current_profile_role() = 'supplier'::public.user_role
    AND public.can_access_tenant(tenant_id)
  );

DROP POLICY IF EXISTS order_items_supplier_read ON public.order_items;
CREATE POLICY order_items_supplier_read ON public.order_items FOR SELECT TO authenticated
  USING (
    public.current_profile_role() = 'supplier'::public.user_role
    AND public.can_access_tenant(tenant_id)
  );

DROP POLICY IF EXISTS order_items_supplier_update ON public.order_items;
CREATE POLICY order_items_supplier_update ON public.order_items FOR UPDATE TO authenticated
  USING (
    public.current_profile_role() = 'supplier'::public.user_role
    AND public.can_access_tenant(tenant_id)
  )
  WITH CHECK (
    public.current_profile_role() = 'supplier'::public.user_role
    AND public.can_access_tenant(tenant_id)
  );

DROP POLICY IF EXISTS substitute_suggestions_supplier_insert ON public.substitute_suggestions;
CREATE POLICY substitute_suggestions_supplier_insert ON public.substitute_suggestions FOR INSERT TO authenticated
  WITH CHECK (
    public.current_profile_role() = 'supplier'::public.user_role
    AND suggested_by = public.current_profile_id()
    AND public.can_access_tenant(tenant_id)
  );

CREATE OR REPLACE FUNCTION public.record_order_item_status(target_order_item_id UUID, next_status public.order_item_status, reason_text TEXT DEFAULT NULL)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_item public.order_items; previous_status public.order_item_status;
BEGIN
  SELECT status INTO previous_status FROM public.order_items WHERE id = target_order_item_id;
  UPDATE public.order_items SET status = next_status, updated_at = NOW() WHERE id = target_order_item_id RETURNING * INTO updated_item;
  INSERT INTO public.order_item_status_history (order_item_id, from_status, to_status, changed_by, change_reason)
  VALUES (target_order_item_id, previous_status, next_status, public.current_profile_id(), reason_text);
  RETURN updated_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_order_item_by_customer(target_order_item_id UUID, approve BOOLEAN, note_text TEXT DEFAULT NULL)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_site UUID; next_status public.order_item_status;
BEGIN
  SELECT site_id INTO target_site FROM public.order_items WHERE id = target_order_item_id;
  IF NOT EXISTS (SELECT 1 FROM public.sites WHERE id = target_site AND customer_id = public.current_profile_id()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  next_status := CASE WHEN approve THEN 'approved_pending_shop_confirmation' ELSE 'rejected_by_customer' END;
  UPDATE public.order_items
  SET customer_notes = COALESCE(note_text, customer_notes),
      customer_reviewed_by = public.current_profile_id(),
      customer_reviewed_at = NOW()
  WHERE id = target_order_item_id;
  RETURN public.record_order_item_status(target_order_item_id, next_status, note_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_order_item_by_architect(target_order_item_id UUID, approve BOOLEAN, note_text TEXT DEFAULT NULL)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_site UUID; next_status public.order_item_status;
BEGIN
  SELECT site_id INTO target_site FROM public.order_items WHERE id = target_order_item_id;
  IF NOT public.can_manage_site_as_contractor(target_site) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  next_status := CASE WHEN approve THEN 'pending_customer_approval' ELSE 'rejected_by_architect' END;
  UPDATE public.order_items
  SET architect_notes = COALESCE(note_text, architect_notes),
      architect_reviewed_by = public.current_profile_id(),
      architect_reviewed_at = NOW()
  WHERE id = target_order_item_id;
  RETURN public.record_order_item_status(target_order_item_id, next_status, note_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.suggest_substitute_item(original_item_id UUID, suggested_product UUID, reason_text TEXT DEFAULT NULL)
RETURNS public.substitute_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result_row public.substitute_suggestions; item_customer UUID; previous_status public.order_item_status;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can suggest substitutes';
  END IF;
  SELECT s.customer_id, oi.status INTO item_customer, previous_status
  FROM public.order_items oi
  JOIN public.sites s ON s.id = oi.site_id
  WHERE oi.id = original_item_id;

  INSERT INTO public.substitute_suggestions (original_order_item_id, suggested_product_id, suggested_by, customer_id, status, reason)
  VALUES (original_item_id, suggested_product, public.current_profile_id(), item_customer, 'suggested', reason_text)
  RETURNING * INTO result_row;

  UPDATE public.order_items
  SET status = 'substitute_suggested', admin_notes = COALESCE(reason_text, admin_notes), updated_at = NOW()
  WHERE id = original_item_id;

  INSERT INTO public.order_item_status_history (order_item_id, from_status, to_status, changed_by, change_reason)
  VALUES (original_item_id, previous_status, 'substitute_suggested', public.current_profile_id(), reason_text);

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_substitute(suggestion_id UUID, accept_choice BOOLEAN)
RETURNS public.substitute_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result_row public.substitute_suggestions; original_item UUID; previous_status public.order_item_status; next_status public.order_item_status;
BEGIN
  UPDATE public.substitute_suggestions
  SET status = CASE WHEN accept_choice THEN 'accepted' ELSE 'rejected' END,
      customer_response_at = NOW(),
      updated_at = NOW()
  WHERE id = suggestion_id AND customer_id = public.current_profile_id()
  RETURNING * INTO result_row;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'Not allowed or suggestion not found';
  END IF;

  original_item := result_row.original_order_item_id;
  SELECT status INTO previous_status FROM public.order_items WHERE id = original_item;
  next_status := CASE WHEN accept_choice THEN 'approved_pending_shop_confirmation' ELSE 'substitute_rejected' END;

  UPDATE public.order_items
  SET status = next_status,
      customer_reviewed_by = public.current_profile_id(),
      customer_reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = original_item;

  INSERT INTO public.order_item_status_history (order_item_id, from_status, to_status, changed_by, change_reason)
  VALUES (
    original_item,
    previous_status,
    next_status,
    public.current_profile_id(),
    CASE WHEN accept_choice THEN 'Customer accepted substitute' ELSE 'Customer rejected substitute' END
  );

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_item_supplied(target_order_item_id UUID, supplied_qty NUMERIC, note_text TEXT DEFAULT NULL)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  current_required NUMERIC; 
  current_supplied NUMERIC; 
  new_total NUMERIC; 
  next_status public.order_item_status;
  item_product_id UUID;
  current_available NUMERIC;
  current_reserved NUMERIC;
  reserved_deduction NUMERIC;
  available_deduction NUMERIC;
BEGIN
  IF NOT public.is_admin_user() AND public.current_profile_role() != 'supplier'::public.user_role THEN
    RAISE EXCEPTION 'Only admin or supplier can mark supply';
  END IF;
  
  SELECT quantity_required, quantity_supplied, product_id 
  INTO current_required, current_supplied, item_product_id 
  FROM public.order_items 
  WHERE id = target_order_item_id;
  
  new_total := COALESCE(current_supplied, 0) + COALESCE(supplied_qty, 0);
  next_status := CASE WHEN new_total >= current_required THEN 'supplied' ELSE 'partially_supplied' END;
  
  UPDATE public.order_items
  SET quantity_supplied = LEAST(new_total, current_required),
      supplied_by = public.current_profile_id(),
      supplied_at = NOW(),
      admin_notes = COALESCE(note_text, admin_notes),
      shop_confirmed_by = COALESCE(shop_confirmed_by, public.current_profile_id()),
      shop_confirmed_at = COALESCE(shop_confirmed_at, NOW())
  WHERE id = target_order_item_id;

  -- Query current product_inventory values
  SELECT COALESCE(available_qty, 0), COALESCE(reserved_qty, 0)
  INTO current_available, current_reserved
  FROM public.product_inventory
  WHERE product_id = item_product_id;

  -- Calculate how much can be deducted from reserved_qty and available_qty
  reserved_deduction := LEAST(current_reserved, COALESCE(supplied_qty, 0));
  available_deduction := COALESCE(supplied_qty, 0) - reserved_deduction;

  -- Deduct from inventory
  UPDATE public.product_inventory
  SET available_qty = GREATEST(available_qty - available_deduction, 0),
      reserved_qty = GREATEST(reserved_qty - reserved_deduction, 0)
  WHERE product_id = item_product_id;

  RETURN public.record_order_item_status(target_order_item_id, next_status, note_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_professional_user(target_user_id UUID, approve BOOLEAN, admin_note TEXT DEFAULT NULL)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE result_row public.users;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can verify users';
  END IF;
  UPDATE public.users
  SET verification_status = CASE WHEN approve THEN 'verified' ELSE 'rejected' END,
      is_admin_verified = approve,
      notes = COALESCE(admin_note, notes),
      updated_at = NOW()
  WHERE id = target_user_id
  RETURNING * INTO result_row;
  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_user_to_admin(target_email TEXT)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_user public.users;
BEGIN
  UPDATE public.users
  SET role = 'admin', is_admin_verified = TRUE, verification_status = 'verified', updated_at = NOW()
  WHERE LOWER(email) = LOWER(target_email)
  RETURNING * INTO updated_user;
  IF updated_user.id IS NULL THEN RAISE EXCEPTION 'No user found for email %', target_email; END IF;
  RETURN updated_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.demote_admin_to_customer(target_email TEXT)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE updated_user public.users;
BEGIN
  UPDATE public.users SET role = 'customer', updated_at = NOW()
  WHERE LOWER(email) = LOWER(target_email)
  RETURNING * INTO updated_user;
  IF updated_user.id IS NULL THEN RAISE EXCEPTION 'No user found for email %', target_email; END IF;
  RETURN updated_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_site_note_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.recipient_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (NEW.recipient_user_id, 'general', 'New note received', LEFT(NEW.note_text, 180), jsonb_build_object('module', 'site_notes', 'site_id', NEW.site_id, 'note_id', NEW.id));
  ELSIF NEW.recipient_role IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT DISTINCT u.id, 'general', 'New note received', LEFT(NEW.note_text, 180), jsonb_build_object('module', 'site_notes', 'site_id', NEW.site_id, 'note_id', NEW.id)
    FROM public.users u
    LEFT JOIN public.sites s ON s.id = NEW.site_id
    LEFT JOIN public.site_assignments sa ON sa.site_id = NEW.site_id AND sa.status = 'active'
    WHERE u.id <> NEW.sender_user_id
      AND (
        (NEW.recipient_role = 'admin' AND u.role = 'admin')
        OR (NEW.recipient_role = 'customer' AND s.customer_id = u.id)
        OR (NEW.recipient_role = 'electrician' AND sa.role = 'electrician' AND sa.user_id = u.id)
        OR (NEW.recipient_role = 'architect' AND sa.role = 'architect' AND sa.user_id = u.id)
      );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_product_request_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT u.id, 'general', 'New architect product request', LEFT(NEW.title || ': ' || NEW.description, 180), jsonb_build_object('module', 'product_requests', 'site_id', NEW.site_id, 'request_id', NEW.id)
    FROM public.users u WHERE u.role = 'admin';
  ELSIF TG_OP = 'UPDATE' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes OR NEW.matched_product_id IS DISTINCT FROM OLD.matched_product_id) THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.requested_by_user_id,
      'general',
      'Product request updated',
      LEFT(COALESCE(NEW.admin_notes, 'Your product request has a new update.'), 180),
      jsonb_build_object('module', 'product_requests', 'site_id', NEW.site_id, 'request_id', NEW.id, 'status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_site_notes_notify AFTER INSERT ON public.site_notes FOR EACH ROW EXECUTE FUNCTION public.create_site_note_notifications();
CREATE TRIGGER trg_product_requests_notify AFTER INSERT OR UPDATE OF status, admin_notes, matched_product_id ON public.product_requests FOR EACH ROW EXECUTE FUNCTION public.create_product_request_notifications();

CREATE OR REPLACE VIEW public.vw_site_order_item_enriched WITH (security_invoker = true) AS
SELECT
  oi.id AS order_item_id,
  oi.site_order_id,
  oi.site_id,
  s.site_code,
  s.site_name,
  s.customer_id,
  customer.full_name AS customer_name,
  sa_electrician.user_id AS electrician_id,
  electrician.full_name AS electrician_name,
  sa_architect.user_id AS architect_id,
  architect.full_name AS architect_name,
  oi.product_id,
  p.sku AS current_product_sku,
  oi.item_name_snapshot,
  oi.category_name_snapshot,
  oi.brand_name_snapshot,
  oi.sku_snapshot,
  oi.unit_snapshot,
  oi.source,
  oi.source_user_id,
  source_user.full_name AS source_user_name,
  oi.parent_order_item_id,
  oi.approval_mode,
  oi.requires_architect_approval,
  oi.quantity_required,
  oi.quantity_approved,
  oi.quantity_supplied,
  oi.unit_price,
  oi.line_subtotal,
  oi.tax_amount,
  oi.line_total,
  oi.electrician_notes,
  oi.architect_notes,
  oi.customer_notes,
  oi.admin_notes,
  oi.status,
  oi.is_substitute,
  oi.substitute_for_order_item_id,
  oi.substitute_status,
  oi.architect_reviewed_by,
  arch_reviewer.full_name AS architect_reviewed_by_name,
  oi.architect_reviewed_at,
  oi.customer_reviewed_by,
  cust_reviewer.full_name AS customer_reviewed_by_name,
  oi.customer_reviewed_at,
  oi.shop_confirmed_by,
  shop_confirmer.full_name AS shop_confirmed_by_name,
  oi.shop_confirmed_at,
  oi.supplied_by,
  supplier.full_name AS supplied_by_name,
  oi.supplied_at,
  oi.created_at,
  oi.updated_at
FROM public.order_items oi
JOIN public.sites s ON s.id = oi.site_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.products p ON p.id = oi.product_id
LEFT JOIN public.users source_user ON source_user.id = oi.source_user_id
LEFT JOIN public.users arch_reviewer ON arch_reviewer.id = oi.architect_reviewed_by
LEFT JOIN public.users cust_reviewer ON cust_reviewer.id = oi.customer_reviewed_by
LEFT JOIN public.users shop_confirmer ON shop_confirmer.id = oi.shop_confirmed_by
LEFT JOIN public.users supplier ON supplier.id = oi.supplied_by
LEFT JOIN public.site_assignments sa_electrician ON sa_electrician.site_id = s.id AND sa_electrician.role = 'electrician' AND sa_electrician.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_electrician.user_id
LEFT JOIN public.site_assignments sa_architect ON sa_architect.site_id = s.id AND sa_architect.role = 'architect' AND sa_architect.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_architect.user_id;

CREATE OR REPLACE VIEW public.vw_customer_site_projects WITH (security_invoker = true) AS
SELECT
  s.id AS site_id,
  s.customer_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status AS site_status,
  electrician.id AS electrician_id,
  electrician.full_name AS electrician_name,
  architect.id AS architect_id,
  architect.full_name AS architect_name,
  COUNT(DISTINCT oi.id) AS total_material_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('pending_customer_approval', 'substitute_suggested')) AS items_waiting_customer_action,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('approved_pending_shop_confirmation', 'approved_pending_supply', 'partially_supplied')) AS approved_but_not_fully_supplied_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items
FROM public.sites s
LEFT JOIN public.site_assignments sa_electrician ON sa_electrician.site_id = s.id AND sa_electrician.role = 'electrician' AND sa_electrician.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_electrician.user_id
LEFT JOIN public.site_assignments sa_architect ON sa_architect.site_id = s.id AND sa_architect.role = 'architect' AND sa_architect.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_architect.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
GROUP BY s.id, electrician.id, architect.id;

CREATE OR REPLACE VIEW public.vw_customer_budget_tracker WITH (security_invoker = true) AS
SELECT
  s.id AS site_id,
  s.customer_id,
  s.site_code,
  s.site_name,
  COALESCE(bt.initial_budget, s.estimated_budget, 0) AS initial_budget,
  COALESCE(bt.revised_budget, s.estimated_budget, 0) AS revised_budget,
  COALESCE(bt.approved_material_budget, 0) AS approved_material_budget,
  COALESCE(bt.actual_material_spend, s.actual_spend, 0) AS actual_material_spend,
  GREATEST(COALESCE(bt.revised_budget, s.estimated_budget, 0) - COALESCE(bt.actual_material_spend, s.actual_spend, 0), 0) AS remaining_budget
FROM public.sites s
LEFT JOIN public.budget_trackers bt ON bt.site_id = s.id;

CREATE OR REPLACE VIEW public.vw_customer_items_on_approval WITH (security_invoker = true) AS
SELECT * FROM public.vw_site_order_item_enriched WHERE status IN ('pending_customer_approval', 'substitute_suggested');

CREATE OR REPLACE VIEW public.vw_electrician_new_projects WITH (security_invoker = true) AS
SELECT
  s.id AS site_id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft,
  s.architect_required, s.approval_mode, s.estimated_budget, s.status, s.description, s.created_at,
  customer.id AS customer_id, customer.full_name AS customer_name, customer.phone AS customer_phone
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
WHERE s.status = 'open_for_bidding'
  AND NOT EXISTS (SELECT 1 FROM public.site_assignments sa WHERE sa.site_id = s.id AND sa.role = 'electrician' AND sa.status = 'active');

CREATE OR REPLACE VIEW public.vw_electrician_projects_assigned_to_others WITH (security_invoker = true) AS
SELECT
  s.id AS site_id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft,
  s.architect_required, s.approval_mode, s.estimated_budget, s.status,
  customer.id AS customer_id, customer.full_name AS customer_name,
  assigned_electrician.id AS assigned_electrician_id, assigned_electrician.full_name AS assigned_electrician_name
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
JOIN public.site_assignments sa ON sa.site_id = s.id AND sa.role = 'electrician' AND sa.status = 'active'
JOIN public.users assigned_electrician ON assigned_electrician.id = sa.user_id
WHERE s.status IN ('assigned', 'in_progress', 'on_hold') AND assigned_electrician.role = 'electrician';

CREATE OR REPLACE VIEW public.vw_electrician_ongoing_projects WITH (security_invoker = true) AS
SELECT
  s.id AS site_id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft,
  s.architect_required, s.approval_mode, s.estimated_budget, s.actual_spend, s.status AS site_status,
  customer.id AS customer_id, customer.full_name AS customer_name,
  sa.user_id AS electrician_id, electrician.full_name AS electrician_name,
  architect.id AS architect_id, architect.full_name AS architect_name,
  COUNT(DISTINCT oi.id) AS total_material_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_architect_approval') AS architect_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_customer_approval') AS customer_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('approved_pending_supply', 'partially_supplied')) AS supply_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items
FROM public.site_assignments sa
JOIN public.sites s ON s.id = sa.site_id
JOIN public.users electrician ON electrician.id = sa.user_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.site_assignments sa_arch ON sa_arch.site_id = s.id AND sa_arch.role = 'architect' AND sa_arch.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_arch.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
WHERE sa.role = 'electrician' AND sa.status = 'active' AND s.status IN ('assigned', 'in_progress', 'on_hold')
GROUP BY s.id, customer.id, sa.user_id, electrician.full_name, architect.id, architect.full_name;

CREATE OR REPLACE VIEW public.vw_electrician_material_tracker WITH (security_invoker = true) AS
SELECT v.*,
  CASE WHEN v.status <> 'cancelled' THEN TRUE ELSE FALSE END AS in_master_requirement_list,
  CASE WHEN v.status = 'supplied' THEN TRUE ELSE FALSE END AS in_material_already_on_site,
  CASE WHEN v.status IN ('draft_by_electrician', 'draft_by_architect', 'approved_pending_shop_confirmation', 'approved_pending_supply', 'partially_supplied', 'substitute_suggested', 'substitute_accepted') THEN TRUE ELSE FALSE END AS in_pending_general,
  CASE WHEN v.status = 'pending_architect_approval' THEN TRUE ELSE FALSE END AS in_architect_approval_pending,
  CASE WHEN v.status = 'pending_customer_approval' THEN TRUE ELSE FALSE END AS in_customer_approval_pending,
  CASE WHEN v.status IN ('approved_pending_supply', 'partially_supplied') THEN TRUE ELSE FALSE END AS in_shop_supply_pending
FROM public.vw_site_order_item_enriched v
WHERE v.electrician_id IS NOT NULL;

CREATE OR REPLACE VIEW public.vw_architect_new_projects WITH (security_invoker = true) AS
SELECT
  s.id AS site_id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft,
  s.architect_required, s.approval_mode, s.estimated_budget, s.status, s.description, s.created_at,
  customer.id AS customer_id, customer.full_name AS customer_name, customer.phone AS customer_phone
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
WHERE s.status = 'open_for_bidding'
  AND s.architect_required = TRUE
  AND NOT EXISTS (SELECT 1 FROM public.site_assignments sa WHERE sa.site_id = s.id AND sa.role = 'architect' AND sa.status = 'active');

CREATE OR REPLACE VIEW public.vw_architect_ongoing_projects WITH (security_invoker = true) AS
SELECT
  s.id AS site_id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft,
  s.approval_mode, s.estimated_budget, s.actual_spend, s.status AS site_status,
  customer.id AS customer_id, customer.full_name AS customer_name,
  sa.user_id AS architect_id, architect.full_name AS architect_name,
  electrician.id AS electrician_id, electrician.full_name AS electrician_name,
  COUNT(DISTINCT oi.id) AS total_material_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_architect_approval') AS electrician_requested_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_customer_approval') AS customer_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('approved_pending_supply', 'partially_supplied')) AS supply_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items
FROM public.site_assignments sa
JOIN public.sites s ON s.id = sa.site_id
JOIN public.users architect ON architect.id = sa.user_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.site_assignments sa_ele ON sa_ele.site_id = s.id AND sa_ele.role = 'electrician' AND sa_ele.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_ele.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
WHERE sa.role = 'architect' AND sa.status = 'active' AND s.status IN ('assigned', 'in_progress', 'on_hold')
GROUP BY s.id, customer.id, sa.user_id, architect.full_name, electrician.id, electrician.full_name;

CREATE OR REPLACE VIEW public.vw_architect_material_tracker WITH (security_invoker = true) AS
SELECT v.*,
  CASE WHEN v.status <> 'cancelled' THEN TRUE ELSE FALSE END AS in_master_materials_required_list,
  CASE WHEN v.status = 'pending_architect_approval' THEN TRUE ELSE FALSE END AS in_materials_required_by_electrician,
  CASE WHEN v.status = 'supplied' THEN TRUE ELSE FALSE END AS in_material_already_supplied,
  CASE WHEN v.status = 'pending_customer_approval' THEN TRUE ELSE FALSE END AS in_architect_approved_pending_customer,
  CASE WHEN v.status IN ('approved_pending_supply', 'partially_supplied') THEN TRUE ELSE FALSE END AS in_completely_approved_pending_supply
FROM public.vw_site_order_item_enriched v
WHERE v.architect_id IS NOT NULL;

CREATE OR REPLACE VIEW public.vw_product_requests_enriched WITH (security_invoker = true) AS
SELECT
  pr.id,
  pr.site_id,
  s.site_code,
  s.site_name,
  s.customer_id,
  pr.requested_by_user_id,
  requester.full_name AS requested_by_name,
  requester.role AS requested_by_role,
  pr.title,
  pr.preferred_category,
  pr.preferred_brand,
  pr.description,
  pr.status,
  pr.matched_product_id,
  matched_product.item_name AS matched_product_name,
  matched_product.sku AS matched_product_sku,
  pr.admin_notes,
  pr.ordered_at,
  pr.fulfilled_at,
  pr.created_at,
  pr.updated_at
FROM public.product_requests pr
JOIN public.sites s ON s.id = pr.site_id
JOIN public.users requester ON requester.id = pr.requested_by_user_id
LEFT JOIN public.products matched_product ON matched_product.id = pr.matched_product_id;

CREATE OR REPLACE VIEW public.vw_site_notes_enriched WITH (security_invoker = true) AS
SELECT
  sn.id,
  sn.site_id,
  s.site_code,
  s.site_name,
  sn.sender_user_id,
  sender.full_name AS sender_name,
  sender.role AS sender_role,
  sn.recipient_role,
  sn.recipient_user_id,
  recipient.full_name AS recipient_name,
  sn.note_text,
  sn.created_at,
  sn.updated_at
FROM public.site_notes sn
JOIN public.sites s ON s.id = sn.site_id
JOIN public.users sender ON sender.id = sn.sender_user_id
LEFT JOIN public.users recipient ON recipient.id = sn.recipient_user_id;



-- =====================================================================
-- SOURCE: db/monetization_risk_control_patch.sql
-- =====================================================================

-- Additive migration for B2B Procurement Monetization and Payment-Risk Control

-- ==========================================
-- TYPES AND ENUMS (If not already defined)
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_account_type') THEN
        CREATE TYPE public.ledger_account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_direction') THEN
        CREATE TYPE public.ledger_entry_direction AS ENUM ('DEBIT', 'CREDIT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_band_type') THEN
        CREATE TYPE public.risk_band_type AS ENUM ('LOW', 'MODERATE', 'HIGH', 'BLOCKED');
    END IF;
END
$$;

-- ==========================================
-- 0. Core Ledger Infrastructure Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_number VARCHAR(60) NOT NULL,
  name VARCHAR(150) NOT NULL,
  type public.ledger_account_type NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR',
  balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_number),
  UNIQUE (tenant_id, user_id, account_number)
);

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reference_type VARCHAR(60) NOT NULL, -- 'WALLET_DEPOSIT', 'ESCROW_LOCK', 'ESCROW_RELEASE', 'CREDIT_DISBURSEMENT', 'PROCUREMENT_FEE', 'REPAYMENT', 'PENALTY', 'SAVINGS_SHARE'
  reference_id UUID NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.ledger_transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  direction public.ledger_entry_direction NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 1. Risk and Credit Profiling Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.contractor_risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  trust_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (trust_score BETWEEN 0 AND 100),
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (credit_limit >= 0),
  outstanding_credit NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (outstanding_credit >= 0),
  payment_history_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (payment_history_score BETWEEN 0 AND 100),
  repayment_consistency NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (repayment_consistency BETWEEN 0 AND 100),
  dispute_count INTEGER NOT NULL DEFAULT 0 CHECK (dispute_count >= 0),
  project_completion_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (project_completion_score BETWEEN 0 AND 100),
  risk_band public.risk_band_type NOT NULL DEFAULT 'BLOCKED',
  default_probability NUMERIC(5,4) NOT NULL DEFAULT 1.0000 CHECK (default_probability BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.credit_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  allocated_limit NUMERIC(14,2) NOT NULL CHECK (allocated_limit >= 0),
  available_limit NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (available_limit >= 0),
  utilized_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (utilized_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_allocated_vs_utilized CHECK (utilized_amount <= allocated_limit)
);

CREATE TABLE IF NOT EXISTS public.site_credit_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL UNIQUE REFERENCES public.sites(id) ON DELETE CASCADE,
  site_budget NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (site_budget >= 0),
  approved_limit NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (approved_limit >= 0),
  utilization NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (utilization >= 0),
  repayment_status VARCHAR(30) NOT NULL DEFAULT 'CURRENT', -- 'CURRENT', 'DELINQUENT', 'DEFAULT'
  architect_verification public.verification_status NOT NULL DEFAULT 'pending',
  customer_backing public.verification_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_site_utilized_amount CHECK (utilization <= approved_limit)
);

CREATE TABLE IF NOT EXISTS public.credit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
  purpose TEXT,
  status public.finance_application_status NOT NULL DEFAULT 'draft',
  approved_amount NUMERIC(14,2) CHECK (approved_amount >= 0),
  advance_required_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (advance_required_percentage BETWEEN 0 AND 100),
  reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. Escrow Architecture Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.escrow_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  site_order_id UUID NOT NULL REFERENCES public.site_orders(id) ON DELETE CASCADE,
  total_escrow_amount NUMERIC(14,2) NOT NULL CHECK (total_escrow_amount >= 0),
  locked_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (locked_amount >= 0),
  released_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (released_amount >= 0),
  disputed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (disputed_amount >= 0),
  status public.finance_application_status NOT NULL DEFAULT 'draft', -- using finance_application_status mapping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_escrow_totals CHECK (locked_amount + released_amount + disputed_amount <= total_escrow_amount)
);

CREATE TABLE IF NOT EXISTS public.escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  escrow_account_id UUID NOT NULL REFERENCES public.escrow_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  type VARCHAR(30) NOT NULL, -- 'LOCK', 'RELEASE', 'DISPUTE_HOLD', 'DISPUTE_RELEASE', 'REFUND'
  ledger_tx_id UUID REFERENCES public.ledger_transactions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. Risk Mitigation & Guarantees Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.payment_guarantees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  guarantor_type VARCHAR(30) NOT NULL, -- 'CUSTOMER_DIRECT', 'THIRD_PARTY_SPONSOR', 'BANK_LCI'
  guarantee_amount NUMERIC(14,2) NOT NULL CHECK (guarantee_amount > 0),
  document_url TEXT,
  status public.verification_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.repayment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_order_id UUID REFERENCES public.site_orders(id) ON DELETE SET NULL,
  total_due NUMERIC(14,2) NOT NULL CHECK (total_due >= 0),
  principal_due NUMERIC(14,2) NOT NULL CHECK (principal_due >= 0),
  interest_due NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (interest_due >= 0),
  penalty_due NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (penalty_due >= 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
  due_date DATE NOT NULL,
  status public.installment_status NOT NULL DEFAULT 'pending', -- pending, paid, late, waived, cancelled
  paid_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_paid_limit CHECK (amount_paid <= total_due)
);

-- ==========================================
-- 4. Monetization & Subscription Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.procurement_fee_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_order_id UUID NOT NULL REFERENCES public.site_orders(id) ON DELETE CASCADE,
  fee_model VARCHAR(30) NOT NULL, -- 'FIXED', 'PERCENTAGE', 'SAVINGS_SHARE', 'ESCROW_SETTLEMENT'
  calculated_fee NUMERIC(14,2) NOT NULL CHECK (calculated_fee >= 0),
  waived_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (waived_amount >= 0),
  final_fee NUMERIC(14,2) NOT NULL CHECK (final_fee >= 0),
  payment_status public.installment_status NOT NULL DEFAULT 'pending',
  ledger_tx_id UUID REFERENCES public.ledger_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.urgency_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  urgency_level VARCHAR(20) NOT NULL CHECK (urgency_level IN ('STANDARD', 'PRIORITY', 'EMERGENCY')),
  fee_type VARCHAR(20) NOT NULL CHECK (fee_type IN ('FIXED', 'PERCENTAGE')),
  fee_value NUMERIC(14,2) NOT NULL CHECK (fee_value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, urgency_level)
);

CREATE TABLE IF NOT EXISTS public.supplier_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL, -- 'FREE', 'PREMIUM', 'ELITE'
  name VARCHAR(100) NOT NULL,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.contractor_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL, -- 'FREE', 'PRO', 'ENTERPRISE'
  name VARCHAR(100) NOT NULL,
  price NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

-- ==========================================
-- Triggers for auto updated_at columns
-- ==========================================
CREATE TRIGGER trg_ledger_accounts_updated_at BEFORE UPDATE ON public.ledger_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_contractor_risk_profiles_updated_at BEFORE UPDATE ON public.contractor_risk_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_credit_limits_updated_at BEFORE UPDATE ON public.credit_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_site_credit_profiles_updated_at BEFORE UPDATE ON public.site_credit_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_credit_requests_updated_at BEFORE UPDATE ON public.credit_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_escrow_accounts_updated_at BEFORE UPDATE ON public.escrow_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payment_guarantees_updated_at BEFORE UPDATE ON public.payment_guarantees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_repayment_schedules_updated_at BEFORE UPDATE ON public.repayment_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_procurement_fee_entries_updated_at BEFORE UPDATE ON public.procurement_fee_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_urgency_pricing_updated_at BEFORE UPDATE ON public.urgency_pricing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_supplier_subscription_plans_updated_at BEFORE UPDATE ON public.supplier_subscription_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_contractor_subscription_plans_updated_at BEFORE UPDATE ON public.contractor_subscription_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- Indices for Query Performance
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_user ON public.ledger_accounts(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON public.ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON public.ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_risk_profiles_user ON public.contractor_risk_profiles(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_order ON public.escrow_accounts(site_order_id);
CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON public.credit_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_due ON public.repayment_schedules(tenant_id, due_date, status);



-- =====================================================================
-- SOURCE: db/monetization_rls_patch.sql
-- =====================================================================

-- RLS Patch for B2B Procurement Monetization and Payment-Risk Control

-- Enable Row Level Security
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_credit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_guarantees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repayment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_fee_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS ledger_accounts_select_policy ON public.ledger_accounts;
DROP POLICY IF EXISTS ledger_accounts_admin_all ON public.ledger_accounts;
DROP POLICY IF EXISTS ledger_transactions_select ON public.ledger_transactions;
DROP POLICY IF EXISTS ledger_entries_select ON public.ledger_entries;
DROP POLICY IF EXISTS risk_profiles_select ON public.contractor_risk_profiles;
DROP POLICY IF EXISTS credit_requests_select ON public.credit_requests;
DROP POLICY IF EXISTS credit_requests_insert ON public.credit_requests;
DROP POLICY IF EXISTS escrow_accounts_select ON public.escrow_accounts;

-- 1. Ledger Accounts Policies
CREATE POLICY ledger_accounts_select_policy ON public.ledger_accounts
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR user_id = public.current_profile_id()
  )
);

CREATE POLICY ledger_accounts_admin_all ON public.ledger_accounts
FOR ALL TO authenticated
USING (public.is_admin_user());

-- 2. Ledger Entries & Transactions Policies
CREATE POLICY ledger_transactions_select ON public.ledger_transactions
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.ledger_entries le
      JOIN public.ledger_accounts la ON la.id = le.account_id
      WHERE le.transaction_id = ledger_transactions.id
        AND la.user_id = public.current_profile_id()
    )
  )
);

CREATE POLICY ledger_entries_select ON public.ledger_entries
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.ledger_accounts la
      WHERE la.id = ledger_entries.account_id
        AND la.user_id = public.current_profile_id()
    )
  )
);

-- 3. Contractor Risk Profile Policies
CREATE POLICY risk_profiles_select ON public.contractor_risk_profiles
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR user_id = public.current_profile_id()
  )
);

-- 4. Credit Requests Policies
CREATE POLICY credit_requests_select ON public.credit_requests
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR contractor_id = public.current_profile_id()
  )
);

CREATE POLICY credit_requests_insert ON public.credit_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND contractor_id = public.current_profile_id()
);

-- 5. Escrow Account Policies
CREATE POLICY escrow_accounts_select ON public.escrow_accounts
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR customer_id = public.current_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.site_orders so
      WHERE so.id = escrow_accounts.site_order_id
        AND (so.electrician_id = public.current_profile_id() OR so.architect_id = public.current_profile_id())
    )
  )
);



-- =====================================================================
-- SOURCE: db/lighting_visualizer_foundation.sql
-- =====================================================================


CREATE TABLE IF NOT EXISTS public.lighting_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  brand VARCHAR(120) NOT NULL,
  product_name VARCHAR(180) NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'architectural_lighting',
  sku VARCHAR(120),
  cri INTEGER NOT NULL CHECK (cri >= 50 AND cri <= 100),
  kelvin INTEGER NOT NULL CHECK (kelvin >= 2200 AND kelvin <= 7000),
  ugr NUMERIC(4,1) NOT NULL CHECK (ugr >= 5 AND ugr <= 35),
  lumens INTEGER NOT NULL CHECK (lumens > 0),
  beam_angle INTEGER,
  finish VARCHAR(80),
  summary TEXT,
  hero_badge VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_lighting_products_updated_at ON public.lighting_products;

CREATE TRIGGER trg_lighting_products_updated_at
BEFORE UPDATE ON public.lighting_products
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requester_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.lighting_products(id) ON DELETE SET NULL,
  module VARCHAR(120) NOT NULL DEFAULT 'architectural_lighting_visualizer',
  room_type VARCHAR(120),
  contact_name VARCHAR(180) NOT NULL,
  contact_phone VARCHAR(30),
  contact_email VARCHAR(255),
  notes TEXT,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lighting_products_tenant_id
ON public.lighting_products(tenant_id);

CREATE INDEX IF NOT EXISTS idx_leads_tenant_id
ON public.leads(tenant_id);

CREATE INDEX IF NOT EXISTS idx_leads_requester_user_id
ON public.leads(requester_user_id);

ALTER TABLE public.lighting_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lighting_products_select_accessible ON public.lighting_products;
CREATE POLICY lighting_products_select_accessible
ON public.lighting_products
FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));

DROP POLICY IF EXISTS lighting_products_admin_write ON public.lighting_products;
CREATE POLICY lighting_products_admin_write
ON public.lighting_products
FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

DROP POLICY IF EXISTS leads_insert_accessible ON public.leads;
CREATE POLICY leads_insert_accessible
ON public.leads
FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND (
    requester_user_id IS NULL
    OR requester_user_id = public.current_profile_id()
    OR public.is_admin_user()
  )
);

DROP POLICY IF EXISTS leads_select_own_or_admin ON public.leads;
CREATE POLICY leads_select_own_or_admin
ON public.leads
FOR SELECT TO authenticated
USING (
  (requester_user_id = public.current_profile_id() AND public.can_access_tenant(tenant_id))
  OR (public.is_admin_user() AND public.can_access_tenant(tenant_id))
);

DROP POLICY IF EXISTS leads_update_admin_only ON public.leads;
CREATE POLICY leads_update_admin_only
ON public.leads
FOR UPDATE TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

INSERT INTO public.lighting_products (
  tenant_id,
  brand,
  product_name,
  category,
  sku,
  cri,
  kelvin,
  ugr,
  lumens,
  beam_angle,
  finish,
  summary,
  hero_badge
)
SELECT
  t.id,
  seed.brand,
  seed.product_name,
  'architectural_lighting',
  seed.sku,
  seed.cri,
  seed.kelvin,
  seed.ugr,
  seed.lumens,
  seed.beam_angle,
  seed.finish,
  seed.summary,
  seed.hero_badge
FROM public.tenants t
CROSS JOIN (
  VALUES
    ('Havells', 'Lumos Pro Cove 12W', 'HAV-LUMOS-12', 92, 3000, 16.0, 940, 36, 'Matte white', 'Warm, hospitality-grade cove lighting for premium living rooms.', 'Warm luxury'),
    ('Havells', 'Studio Beam Trim 15W', 'HAV-STUDIO-15', 95, 4000, 14.0, 1260, 24, 'Champagne', 'Balanced neutral white for retail-like visibility without harshness.', 'Balanced'),
    ('Anchor', 'Zen Downlight Elite 10W', 'ANC-ZEN-10', 88, 3500, 18.5, 780, 55, 'Soft silver', 'Comfortable ambient layer with improved color fidelity over standard retail fittings.', 'Comfort'),
    ('Anchor', 'Aura Grid Focus 18W', 'ANC-AURA-18', 90, 5000, 20.0, 1480, 38, 'Graphite', 'Bright task-ready scene with lower glare for kitchens and work zones.', 'Task scene'),
    ('Philips', 'HueSpace Linear 20W', 'PHI-HUESPACE-20', 96, 2700, 13.0, 1620, 90, 'Brushed brass', 'Rich color rendering and cozy golden tone for premium lounge areas.', 'High CRI'),
    ('Philips', 'Precision Office Wash 24W', 'PHI-PRECISION-24', 93, 6000, 17.0, 2100, 60, 'Snow white', 'Sharp white architectural wash for crisp detail and material accuracy.', 'Cool clarity')
) AS seed(brand, product_name, sku, cri, kelvin, ugr, lumens, beam_angle, finish, summary, hero_badge)
WHERE t.slug = 'mahalaxmi-electricals'
  AND NOT EXISTS (
    SELECT 1
    FROM public.lighting_products lp
    WHERE lp.tenant_id = t.id
      AND lp.sku = seed.sku
  );



-- =====================================================================
-- SOURCE: db/leads_status_migration.sql
-- =====================================================================

-- Add status field to leads table and create indexes for B2B pipeline monitoring


-- 1. Create the lead status enumeration type if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'quoted', 'sample_dispatched', 'won', 'lost');
  END IF;
END
$$;

-- 2. Add the flat status column to your leads table with default 'new'
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS status public.lead_status NOT NULL DEFAULT 'new';

-- 3. Sync existing leads data by extracting the status from their configuration JSONB if present
UPDATE public.leads 
SET status = COALESCE(
  CASE 
    WHEN configuration->>'status' IN ('new', 'contacted', 'quoted', 'sample_dispatched', 'won', 'lost') 
    THEN (configuration->>'status')::public.lead_status
    ELSE 'new'::public.lead_status
  END, 
  'new'::public.lead_status
);

-- 4. Create a high-performance B-Tree index for rapid filtering and dashboard rendering
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);



-- =====================================================================
-- SOURCE: db/lighting_visualizer_rls_perf.sql
-- =====================================================================

-- Migration to optimize RLS policies, index performance, and enable Supabase Realtime for Lighting Products and Leads

-- 1. Create composite indexes to speed up frontend queries
-- Index for lighting_products SELECT: WHERE tenant_id = ? AND is_active = true ORDER BY brand, product_name
CREATE INDEX IF NOT EXISTS idx_lighting_products_tenant_active_brand_name
ON public.lighting_products(tenant_id, is_active, brand, product_name);

-- Index for leads SELECT: WHERE tenant_id = ? AND module = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_leads_tenant_module_created_at
ON public.leads(tenant_id, module, created_at DESC);


-- 2. Optimize RLS Policies for public.lighting_products
-- Drop existing policies
DROP POLICY IF EXISTS lighting_products_select_accessible ON public.lighting_products;
DROP POLICY IF EXISTS lighting_products_admin_write ON public.lighting_products;

-- Optimized SELECT policy using inline subqueries instead of nested functions
CREATE POLICY lighting_products_select_accessible
ON public.lighting_products
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = public.lighting_products.tenant_id
            AND tm.user_id = u.id
            AND tm.is_active = TRUE
        )
      )
  )
);

-- Optimized ALL policy for admin writes
CREATE POLICY lighting_products_admin_write
ON public.lighting_products
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.lighting_products.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.lighting_products.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
  )
);


-- 3. Optimize RLS Policies for public.leads
-- Drop existing policies
DROP POLICY IF EXISTS leads_select_own_or_admin ON public.leads;
DROP POLICY IF EXISTS leads_insert_accessible ON public.leads;
DROP POLICY IF EXISTS leads_update_admin_only ON public.leads;

-- Optimized SELECT policy for leads
CREATE POLICY leads_select_own_or_admin
ON public.leads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.leads.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
      AND (
        u.role = 'admin'
        OR public.leads.requester_user_id = u.id
      )
  )
);

-- Optimized INSERT policy for leads
CREATE POLICY leads_insert_accessible
ON public.leads
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.leads.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
      AND (
        public.leads.requester_user_id IS NULL
        OR public.leads.requester_user_id = u.id
        OR u.role = 'admin'
      )
  )
);

-- Optimized UPDATE policy for leads
CREATE POLICY leads_update_admin_only
ON public.leads
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.leads.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.leads.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
  )
);


-- 4. Enable Supabase Realtime for Leads and Lighting Products
-- Ensure the publication exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- Add lighting_products to the publication if it's not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'lighting_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lighting_products;
  END IF;
END
$$;

-- Add leads to the publication if it's not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END
$$;



-- =====================================================================
-- SOURCE: db/maintenance_bidding_marketplace.sql
-- =====================================================================


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'bid_status'
  ) THEN
    CREATE TYPE public.bid_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  handyman_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  estimated_days integer NOT NULL CHECK (estimated_days > 0),
  status public.bid_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, handyman_id)
);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS budget_range numeric(12,2),
  ADD COLUMN IF NOT EXISTS max_budget numeric(12,2),
  ADD COLUMN IF NOT EXISTS assigned_handyman_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assignment_deadline timestamptz;

CREATE INDEX IF NOT EXISTS idx_bids_task_status_created
  ON public.bids (task_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bids_handyman_status
  ON public.bids (handyman_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_category_status
  ON public.tasks (tenant_id, category, status);



-- =====================================================================
-- SOURCE: db/platform_event_outbox.sql
-- =====================================================================

-- Durable domain event outbox for the NestJS API.
-- Apply this before relying on queued event relay in production.

create table if not exists public.platform_event_outbox (
  id uuid primary key,
  event_type text not null,
  schema_version integer not null default 1,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'dispatched', 'failed')),
  occurred_at timestamptz not null,
  available_at timestamptz not null default now(),
  dispatched_at timestamptz null,
  attempt_count integer not null default 0,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_event_outbox_status_available
  on public.platform_event_outbox (status, available_at);

create index if not exists idx_platform_event_outbox_event_type
  on public.platform_event_outbox (event_type, occurred_at desc);

create or replace function public.touch_platform_event_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_platform_event_outbox_updated_at on public.platform_event_outbox;

create trigger trg_platform_event_outbox_updated_at
before update on public.platform_event_outbox
for each row
execute function public.touch_platform_event_outbox_updated_at();

COMMIT;
