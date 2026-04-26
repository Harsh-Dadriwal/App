BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.user_role AS ENUM ('admin', 'customer', 'electrician', 'architect');
CREATE TYPE public.user_status AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE public.site_status AS ENUM ('draft', 'open_for_bidding', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled');
CREATE TYPE public.bid_status AS ENUM ('submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE public.assignment_role AS ENUM ('electrician', 'architect');
CREATE TYPE public.assignment_status AS ENUM ('active', 'removed', 'completed');
CREATE TYPE public.inventory_stock_status AS ENUM ('in_stock', 'out_of_stock', 'limited');
CREATE TYPE public.requirement_source AS ENUM ('electrician', 'architect', 'admin', 'customer');
CREATE TYPE public.approval_mode AS ENUM ('architect_then_customer', 'customer_only');
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
CREATE TYPE public.substitute_status AS ENUM ('suggested', 'accepted', 'rejected', 'expired');
CREATE TYPE public.order_status AS ENUM ('draft', 'awaiting_approval', 'partially_approved', 'confirmed', 'processing', 'partially_supplied', 'supplied', 'cancelled');
CREATE TYPE public.finance_application_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'closed');
CREATE TYPE public.content_category AS ENUM ('electrical_tips', 'home_tips');
CREATE TYPE public.notification_type AS ENUM ('general', 'approval_requested', 'approval_completed', 'substitute_suggested', 'substitute_response', 'bid_update', 'order_update', 'finance_update');
CREATE TYPE public.product_request_status AS ENUM ('submitted', 'reviewing', 'matched', 'ordered', 'fulfilled', 'rejected');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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

CREATE TABLE public.product_inventory (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  available_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available_qty >= 0),
  reserved_qty NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  reorder_level NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_admin_limit BEFORE INSERT OR UPDATE OF role ON public.users FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_limit();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
  safe_role public.user_role;
  matched_user_id UUID;
BEGIN
  requested_role := LOWER(COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer'));
  safe_role := CASE
    WHEN requested_role = 'electrician' THEN 'electrician'::public.user_role
    WHEN requested_role = 'architect' THEN 'architect'::public.user_role
    ELSE 'customer'::public.user_role
  END;

  SELECT id
  INTO matched_user_id
  FROM public.users
  WHERE auth_user_id IS NULL
    AND (
      (NEW.email IS NOT NULL AND email IS NOT NULL AND LOWER(email) = LOWER(NEW.email))
      OR
      (NEW.phone IS NOT NULL AND phone IS NOT NULL AND phone = NEW.phone)
    )
  ORDER BY created_at
  LIMIT 1;

  IF matched_user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      email = COALESCE(NULLIF(NEW.email, ''), email),
      phone = COALESCE(NULLIF(NEW.phone, ''), phone),
      full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name, 'User'),
      role = COALESCE(role, safe_role),
      last_login_at = NEW.last_sign_in_at,
      updated_at = NOW()
    WHERE id = matched_user_id;
  ELSE
    INSERT INTO public.users (
      auth_user_id, role, full_name, phone, email, status, verification_status, is_admin_verified, last_login_at
    )
    VALUES (
      NEW.id,
      safe_role,
      COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
        split_part(COALESCE(NULLIF(NEW.email, ''), NULLIF(NEW.phone, ''), 'user'), '@', 1),
        'User'
      ),
      NULLIF(NEW.phone, ''),
      NULLIF(NEW.email, ''),
      'active',
      CASE WHEN safe_role = 'customer' THEN 'verified'::public.verification_status ELSE 'pending'::public.verification_status END,
      CASE WHEN safe_role = 'customer' THEN TRUE ELSE FALSE END,
      NEW.last_sign_in_at
    )
    ON CONFLICT (auth_user_id) DO NOTHING;
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
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
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
DECLARE current_required NUMERIC; current_supplied NUMERIC; new_total NUMERIC; next_status public.order_item_status;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can mark supply';
  END IF;
  SELECT quantity_required, quantity_supplied INTO current_required, current_supplied FROM public.order_items WHERE id = target_order_item_id;
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

CREATE OR REPLACE VIEW public.vw_site_order_item_enriched AS
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

CREATE OR REPLACE VIEW public.vw_customer_site_projects AS
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

CREATE OR REPLACE VIEW public.vw_customer_budget_tracker AS
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

CREATE OR REPLACE VIEW public.vw_customer_items_on_approval AS
SELECT * FROM public.vw_site_order_item_enriched WHERE status IN ('pending_customer_approval', 'substitute_suggested');

CREATE OR REPLACE VIEW public.vw_electrician_new_projects AS
SELECT
  s.id AS site_id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft,
  s.architect_required, s.approval_mode, s.estimated_budget, s.status, s.description, s.created_at,
  customer.id AS customer_id, customer.full_name AS customer_name, customer.phone AS customer_phone
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
WHERE s.status = 'open_for_bidding'
  AND NOT EXISTS (SELECT 1 FROM public.site_assignments sa WHERE sa.site_id = s.id AND sa.role = 'electrician' AND sa.status = 'active');

CREATE OR REPLACE VIEW public.vw_electrician_projects_assigned_to_others AS
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

CREATE OR REPLACE VIEW public.vw_electrician_ongoing_projects AS
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

CREATE OR REPLACE VIEW public.vw_electrician_material_tracker AS
SELECT v.*,
  CASE WHEN v.status <> 'cancelled' THEN TRUE ELSE FALSE END AS in_master_requirement_list,
  CASE WHEN v.status = 'supplied' THEN TRUE ELSE FALSE END AS in_material_already_on_site,
  CASE WHEN v.status IN ('draft_by_electrician', 'draft_by_architect', 'approved_pending_shop_confirmation', 'approved_pending_supply', 'partially_supplied', 'substitute_suggested', 'substitute_accepted') THEN TRUE ELSE FALSE END AS in_pending_general,
  CASE WHEN v.status = 'pending_architect_approval' THEN TRUE ELSE FALSE END AS in_architect_approval_pending,
  CASE WHEN v.status = 'pending_customer_approval' THEN TRUE ELSE FALSE END AS in_customer_approval_pending,
  CASE WHEN v.status IN ('approved_pending_supply', 'partially_supplied') THEN TRUE ELSE FALSE END AS in_shop_supply_pending
FROM public.vw_site_order_item_enriched v
WHERE v.electrician_id IS NOT NULL;

CREATE OR REPLACE VIEW public.vw_architect_new_projects AS
SELECT
  s.id AS site_id, s.site_code, s.site_name, s.project_type, s.city, s.state, s.area_sqft,
  s.architect_required, s.approval_mode, s.estimated_budget, s.status, s.description, s.created_at,
  customer.id AS customer_id, customer.full_name AS customer_name, customer.phone AS customer_phone
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
WHERE s.status = 'open_for_bidding'
  AND s.architect_required = TRUE
  AND NOT EXISTS (SELECT 1 FROM public.site_assignments sa WHERE sa.site_id = s.id AND sa.role = 'architect' AND sa.status = 'active');

CREATE OR REPLACE VIEW public.vw_architect_ongoing_projects AS
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

CREATE OR REPLACE VIEW public.vw_architect_material_tracker AS
SELECT v.*,
  CASE WHEN v.status <> 'cancelled' THEN TRUE ELSE FALSE END AS in_master_materials_required_list,
  CASE WHEN v.status = 'pending_architect_approval' THEN TRUE ELSE FALSE END AS in_materials_required_by_electrician,
  CASE WHEN v.status = 'supplied' THEN TRUE ELSE FALSE END AS in_material_already_supplied,
  CASE WHEN v.status = 'pending_customer_approval' THEN TRUE ELSE FALSE END AS in_architect_approved_pending_customer,
  CASE WHEN v.status IN ('approved_pending_supply', 'partially_supplied') THEN TRUE ELSE FALSE END AS in_completely_approved_pending_supply
FROM public.vw_site_order_item_enriched v
WHERE v.architect_id IS NOT NULL;

CREATE OR REPLACE VIEW public.vw_product_requests_enriched AS
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

CREATE OR REPLACE VIEW public.vw_site_notes_enriched AS
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

COMMIT;
