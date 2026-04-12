BEGIN;

CREATE TYPE public.tenant_status AS ENUM ('active', 'suspended', 'archived');
CREATE TYPE public.tenant_membership_role AS ENUM ('owner', 'admin', 'staff', 'customer', 'electrician', 'architect');

CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(120) NOT NULL UNIQUE,
  legal_name VARCHAR(200) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  status public.tenant_status NOT NULL DEFAULT 'active',
  country_code VARCHAR(10) NOT NULL DEFAULT 'IN',
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR',
  time_zone VARCHAR(80) NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tenant_branding (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_name VARCHAR(200) NOT NULL DEFAULT 'Mahalaxmi Electricals',
  support_email VARCHAR(255),
  support_phone VARCHAR(30),
  logo_url TEXT,
  favicon_url TEXT,
  primary_color VARCHAR(20),
  secondary_color VARCHAR(20),
  accent_color VARCHAR(20),
  website_url TEXT,
  custom_domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tenant_branding_updated_at
BEFORE UPDATE ON public.tenant_branding
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.tenant_membership_role NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE UNIQUE INDEX uq_tenant_memberships_default_user
ON public.tenant_memberships (user_id)
WHERE is_default = TRUE AND is_active = TRUE;

CREATE TRIGGER trg_tenant_memberships_updated_at
BEFORE UPDATE ON public.tenant_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.tenants (
  slug,
  legal_name,
  display_name,
  status,
  country_code,
  currency_code,
  time_zone
)
VALUES (
  'mahalaxmi-electricals',
  'Mahalaxmi Electricals',
  'Mahalaxmi Electricals',
  'active',
  'IN',
  'INR',
  'Asia/Kolkata'
)
ON CONFLICT (slug) DO UPDATE
SET
  legal_name = EXCLUDED.legal_name,
  display_name = EXCLUDED.display_name,
  updated_at = NOW();

INSERT INTO public.tenant_branding (
  tenant_id,
  app_name,
  support_email,
  support_phone
)
SELECT
  t.id,
  'Mahalaxmi Electricals',
  'support@mahalaxmi-electricals.local',
  NULL
FROM public.tenants t
WHERE t.slug = 'mahalaxmi-electricals'
ON CONFLICT (tenant_id) DO NOTHING;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS default_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL;

ALTER TABLE public.user_professional_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.site_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.project_bids ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.product_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.product_brands ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.site_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.order_item_status_history ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.substitute_suggestions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.budget_trackers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.finance_applications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.content_posts ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.product_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.site_notes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

DO $$
DECLARE
  default_tenant UUID;
BEGIN
  SELECT id INTO default_tenant
  FROM public.tenants
  WHERE slug = 'mahalaxmi-electricals';

  UPDATE public.users
  SET default_tenant_id = default_tenant
  WHERE default_tenant_id IS NULL;

  INSERT INTO public.tenant_memberships (
    tenant_id,
    user_id,
    role,
    is_default,
    is_active
  )
  SELECT
    default_tenant,
    u.id,
    CASE
      WHEN u.role = 'admin' THEN 'owner'::public.tenant_membership_role
      WHEN u.role = 'customer' THEN 'customer'::public.tenant_membership_role
      WHEN u.role = 'electrician' THEN 'electrician'::public.tenant_membership_role
      WHEN u.role = 'architect' THEN 'architect'::public.tenant_membership_role
      ELSE 'staff'::public.tenant_membership_role
    END,
    TRUE,
    TRUE
  FROM public.users u
  ON CONFLICT (tenant_id, user_id) DO UPDATE
  SET
    is_default = TRUE,
    is_active = TRUE,
    updated_at = NOW();

  UPDATE public.user_professional_profiles SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.sites SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.site_assignments SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.project_bids SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.product_categories SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.product_brands SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.products SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.site_orders SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.order_items SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.order_item_status_history SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.substitute_suggestions SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.budget_trackers SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.finance_applications SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.content_posts SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.notifications SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.audit_logs SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.product_requests SET tenant_id = default_tenant WHERE tenant_id IS NULL;
  UPDATE public.site_notes SET tenant_id = default_tenant WHERE tenant_id IS NULL;
END
$$;

ALTER TABLE public.user_professional_profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.sites ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.site_assignments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.project_bids ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.product_categories ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.product_brands ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.site_orders ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.order_item_status_history ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.substitute_suggestions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.budget_trackers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.finance_applications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.content_posts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.product_requests ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE public.site_notes ALTER COLUMN tenant_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_default_tenant_id ON public.users(default_tenant_id);
CREATE INDEX IF NOT EXISTS idx_sites_tenant_id ON public.sites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_assignments_tenant_id ON public.site_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_bids_tenant_id ON public.project_bids(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_tenant_id ON public.product_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_brands_tenant_id ON public.product_brands(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON public.products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_orders_tenant_id ON public.site_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_id ON public.order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_budget_trackers_tenant_id ON public.budget_trackers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_finance_applications_tenant_id ON public.finance_applications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_tenant_id ON public.content_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_id ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_requests_tenant_id ON public.product_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_site_notes_tenant_id ON public.site_notes(tenant_id);

ALTER TABLE public.sites DROP CONSTRAINT IF EXISTS sites_site_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sites_tenant_site_code
ON public.sites(tenant_id, site_code);

ALTER TABLE public.site_orders DROP CONSTRAINT IF EXISTS site_orders_order_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_orders_tenant_order_number
ON public.site_orders(tenant_id, order_number);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_tenant_sku
ON public.products(tenant_id, sku);

ALTER TABLE public.finance_applications DROP CONSTRAINT IF EXISTS finance_applications_application_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_applications_tenant_application_number
ON public.finance_applications(tenant_id, application_number);

ALTER TABLE public.content_posts DROP CONSTRAINT IF EXISTS content_posts_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_posts_tenant_slug
ON public.content_posts(tenant_id, slug);

ALTER TABLE public.product_categories DROP CONSTRAINT IF EXISTS product_categories_slug_key;
DROP INDEX IF EXISTS public.uq_product_categories_name_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories_tenant_slug
ON public.product_categories(tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_categories_tenant_name_lower
ON public.product_categories(tenant_id, LOWER(name));

ALTER TABLE public.product_brands DROP CONSTRAINT IF EXISTS product_brands_category_id_slug_key;
DROP INDEX IF EXISTS public.uq_product_brands_category_name_lower;
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_brands_category_slug
ON public.product_brands(category_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_brands_tenant_name_lower
ON public.product_brands(tenant_id, category_id, LOWER(name));

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT default_tenant_id FROM public.users WHERE id = public.current_profile_id()),
    (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = public.current_profile_id()
        AND tm.is_default = TRUE
        AND tm.is_active = TRUE
      LIMIT 1
    ),
    (
      SELECT tm.tenant_id
      FROM public.tenant_memberships tm
      WHERE tm.user_id = public.current_profile_id()
        AND tm.is_active = TRUE
      ORDER BY tm.joined_at
      LIMIT 1
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  WHERE tm.user_id = public.current_profile_id()
    AND tm.is_active = TRUE
$$;

CREATE OR REPLACE FUNCTION public.can_access_tenant(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = target_tenant_id
      AND tm.user_id = public.current_profile_id()
      AND tm.is_active = TRUE
  ) OR public.is_admin_user()
$$;

CREATE OR REPLACE FUNCTION public.can_administer_tenant(target_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = target_tenant_id
      AND tm.user_id = public.current_profile_id()
      AND tm.is_active = TRUE
      AND tm.role IN ('owner', 'admin')
  ) OR public.is_admin_user()
$$;

CREATE OR REPLACE FUNCTION public.can_access_site(target_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sites s
    LEFT JOIN public.site_assignments sa
      ON sa.site_id = s.id
     AND sa.status = 'active'
    WHERE s.id = target_site_id
      AND public.can_access_tenant(s.tenant_id)
      AND (
        public.can_administer_tenant(s.tenant_id)
        OR s.customer_id = public.current_profile_id()
        OR sa.user_id = public.current_profile_id()
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_site_as_contractor(target_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sites s
    JOIN public.site_assignments sa
      ON sa.site_id = s.id
     AND sa.status = 'active'
    WHERE s.id = target_site_id
      AND public.can_access_tenant(s.tenant_id)
      AND sa.user_id = public.current_profile_id()
      AND sa.role IN ('electrician', 'architect')
  ) OR EXISTS (
    SELECT 1
    FROM public.sites s
    WHERE s.id = target_site_id
      AND public.can_administer_tenant(s.tenant_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.sync_tenant_from_site()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.site_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.sites
    WHERE id = NEW.site_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_tenant_from_site_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.site_order_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.site_orders
    WHERE id = NEW.site_order_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_brand_tenant_from_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT tenant_id INTO NEW.tenant_id
    FROM public.product_categories
    WHERE id = NEW.category_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_tenant_from_parents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  category_tenant UUID;
  brand_tenant UUID;
BEGIN
  SELECT tenant_id INTO category_tenant
  FROM public.product_categories
  WHERE id = NEW.category_id;

  SELECT tenant_id INTO brand_tenant
  FROM public.product_brands
  WHERE id = NEW.brand_id;

  IF category_tenant IS NULL OR brand_tenant IS NULL OR category_tenant <> brand_tenant THEN
    RAISE EXCEPTION 'Product category and brand must belong to the same tenant';
  END IF;

  NEW.tenant_id := category_tenant;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_assignments_sync_tenant ON public.site_assignments;
CREATE TRIGGER trg_site_assignments_sync_tenant
BEFORE INSERT OR UPDATE OF site_id
ON public.site_assignments
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_from_site();

DROP TRIGGER IF EXISTS trg_project_bids_sync_tenant ON public.project_bids;
CREATE TRIGGER trg_project_bids_sync_tenant
BEFORE INSERT OR UPDATE OF site_id
ON public.project_bids
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_from_site();

DROP TRIGGER IF EXISTS trg_site_orders_sync_tenant ON public.site_orders;
CREATE TRIGGER trg_site_orders_sync_tenant
BEFORE INSERT OR UPDATE OF site_id
ON public.site_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_from_site();

DROP TRIGGER IF EXISTS trg_budget_trackers_sync_tenant ON public.budget_trackers;
CREATE TRIGGER trg_budget_trackers_sync_tenant
BEFORE INSERT OR UPDATE OF site_id
ON public.budget_trackers
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_from_site();

DROP TRIGGER IF EXISTS trg_product_requests_sync_tenant ON public.product_requests;
CREATE TRIGGER trg_product_requests_sync_tenant
BEFORE INSERT OR UPDATE OF site_id
ON public.product_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_from_site();

DROP TRIGGER IF EXISTS trg_site_notes_sync_tenant ON public.site_notes;
CREATE TRIGGER trg_site_notes_sync_tenant
BEFORE INSERT OR UPDATE OF site_id
ON public.site_notes
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_from_site();

DROP TRIGGER IF EXISTS trg_order_items_sync_tenant ON public.order_items;
CREATE TRIGGER trg_order_items_sync_tenant
BEFORE INSERT OR UPDATE OF site_order_id
ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_tenant_from_site_order();

DROP TRIGGER IF EXISTS trg_product_brands_sync_tenant ON public.product_brands;
CREATE TRIGGER trg_product_brands_sync_tenant
BEFORE INSERT OR UPDATE OF category_id
ON public.product_brands
FOR EACH ROW
EXECUTE FUNCTION public.sync_brand_tenant_from_category();

DROP TRIGGER IF EXISTS trg_products_sync_tenant ON public.products;
CREATE TRIGGER trg_products_sync_tenant
BEFORE INSERT OR UPDATE OF category_id, brand_id
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_tenant_from_parents();

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_administer_tenant(UUID) TO authenticated;

CREATE POLICY tenants_select_accessible ON public.tenants
FOR SELECT TO authenticated
USING (public.can_access_tenant(id));

CREATE POLICY tenant_branding_select_accessible ON public.tenant_branding
FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));

CREATE POLICY tenant_branding_admin_write ON public.tenant_branding
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY tenant_memberships_select_accessible ON public.tenant_memberships
FOR SELECT TO authenticated
USING (user_id = public.current_profile_id() OR public.can_administer_tenant(tenant_id));

CREATE POLICY tenant_memberships_admin_write ON public.tenant_memberships
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

DROP POLICY IF EXISTS product_categories_read ON public.product_categories;
DROP POLICY IF EXISTS product_categories_admin_write ON public.product_categories;
DROP POLICY IF EXISTS product_brands_read ON public.product_brands;
DROP POLICY IF EXISTS product_brands_admin_write ON public.product_brands;
DROP POLICY IF EXISTS products_read ON public.products;
DROP POLICY IF EXISTS products_admin_write ON public.products;
DROP POLICY IF EXISTS product_inventory_read ON public.product_inventory;
DROP POLICY IF EXISTS product_inventory_admin_write ON public.product_inventory;
DROP POLICY IF EXISTS content_read ON public.content_posts;
DROP POLICY IF EXISTS content_write ON public.content_posts;
DROP POLICY IF EXISTS notifications_access ON public.notifications;
DROP POLICY IF EXISTS notifications_write ON public.notifications;
DROP POLICY IF EXISTS sites_insert ON public.sites;
DROP POLICY IF EXISTS sites_update ON public.sites;
DROP POLICY IF EXISTS site_assignments_admin_write ON public.site_assignments;
DROP POLICY IF EXISTS finance_access ON public.finance_applications;
DROP POLICY IF EXISTS finance_write ON public.finance_applications;

CREATE POLICY product_categories_tenant_read ON public.product_categories
FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));

CREATE POLICY product_categories_tenant_write ON public.product_categories
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY product_brands_tenant_read ON public.product_brands
FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));

CREATE POLICY product_brands_tenant_write ON public.product_brands
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY products_tenant_read ON public.products
FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));

CREATE POLICY products_tenant_write ON public.products
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY product_inventory_tenant_read ON public.product_inventory
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_inventory.product_id
      AND public.can_access_tenant(p.tenant_id)
  )
);

CREATE POLICY product_inventory_tenant_write ON public.product_inventory
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_inventory.product_id
      AND public.can_administer_tenant(p.tenant_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = product_inventory.product_id
      AND public.can_administer_tenant(p.tenant_id)
  )
);

CREATE POLICY sites_tenant_insert ON public.sites
FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR customer_id = public.current_profile_id()
  )
);

CREATE POLICY sites_tenant_update ON public.sites
FOR UPDATE TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR customer_id = public.current_profile_id()
  )
)
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR customer_id = public.current_profile_id()
  )
);

CREATE POLICY site_assignments_tenant_write ON public.site_assignments
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY finance_tenant_access ON public.finance_applications
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR customer_id = public.current_profile_id()
  )
);

CREATE POLICY finance_tenant_write ON public.finance_applications
FOR ALL TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR customer_id = public.current_profile_id()
  )
)
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR customer_id = public.current_profile_id()
  )
);

CREATE POLICY content_tenant_read ON public.content_posts
FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id) AND (public.can_administer_tenant(tenant_id) OR is_published = TRUE));

CREATE POLICY content_tenant_write ON public.content_posts
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY notifications_tenant_access ON public.notifications
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR user_id = public.current_profile_id()
  )
);

CREATE POLICY notifications_tenant_write ON public.notifications
FOR ALL TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR user_id = public.current_profile_id()
  )
)
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR user_id = public.current_profile_id()
  )
);

DROP VIEW IF EXISTS public.vw_customer_items_on_approval;
DROP VIEW IF EXISTS public.vw_electrician_material_tracker;
DROP VIEW IF EXISTS public.vw_architect_material_tracker;
DROP VIEW IF EXISTS public.vw_customer_finance_applications;
DROP VIEW IF EXISTS public.vw_customer_site_projects;
DROP VIEW IF EXISTS public.vw_customer_budget_tracker;
DROP VIEW IF EXISTS public.vw_electrician_new_projects;
DROP VIEW IF EXISTS public.vw_electrician_projects_assigned_to_others;
DROP VIEW IF EXISTS public.vw_electrician_ongoing_projects;
DROP VIEW IF EXISTS public.vw_architect_new_projects;
DROP VIEW IF EXISTS public.vw_architect_ongoing_projects;
DROP VIEW IF EXISTS public.vw_product_requests_enriched;
DROP VIEW IF EXISTS public.vw_site_notes_enriched;
DROP VIEW IF EXISTS public.vw_site_order_item_enriched;

CREATE VIEW public.vw_site_order_item_enriched
WITH (security_invoker = true)
AS
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
  oi.updated_at,
  oi.tenant_id
FROM public.order_items oi
JOIN public.sites s ON s.id = oi.site_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.products p ON p.id = oi.product_id
LEFT JOIN public.users source_user ON source_user.id = oi.source_user_id
LEFT JOIN public.users arch_reviewer ON arch_reviewer.id = oi.architect_reviewed_by
LEFT JOIN public.users cust_reviewer ON cust_reviewer.id = oi.customer_reviewed_by
LEFT JOIN public.users shop_confirmer ON shop_confirmer.id = oi.shop_confirmed_by
LEFT JOIN public.users supplier ON supplier.id = oi.supplied_by
LEFT JOIN public.site_assignments sa_electrician
  ON sa_electrician.site_id = s.id
 AND sa_electrician.role = 'electrician'
 AND sa_electrician.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_electrician.user_id
LEFT JOIN public.site_assignments sa_architect
  ON sa_architect.site_id = s.id
 AND sa_architect.role = 'architect'
 AND sa_architect.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_architect.user_id;

CREATE VIEW public.vw_customer_site_projects
WITH (security_invoker = true)
AS
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
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items,
  s.tenant_id
FROM public.sites s
LEFT JOIN public.site_assignments sa_electrician
  ON sa_electrician.site_id = s.id
 AND sa_electrician.role = 'electrician'
 AND sa_electrician.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_electrician.user_id
LEFT JOIN public.site_assignments sa_architect
  ON sa_architect.site_id = s.id
 AND sa_architect.role = 'architect'
 AND sa_architect.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_architect.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
GROUP BY
  s.tenant_id,
  s.id,
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
  s.status,
  electrician.id,
  electrician.full_name,
  architect.id,
  architect.full_name;

CREATE VIEW public.vw_customer_budget_tracker
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.customer_id,
  s.site_code,
  s.site_name,
  COALESCE(bt.initial_budget, s.estimated_budget, 0) AS initial_budget,
  COALESCE(bt.revised_budget, s.estimated_budget, 0) AS revised_budget,
  COALESCE(bt.approved_material_budget, 0) AS approved_material_budget,
  COALESCE(bt.actual_material_spend, s.actual_spend, 0) AS actual_material_spend,
  GREATEST(COALESCE(bt.revised_budget, s.estimated_budget, 0) - COALESCE(bt.actual_material_spend, s.actual_spend, 0), 0) AS remaining_budget,
  s.tenant_id
FROM public.sites s
LEFT JOIN public.budget_trackers bt ON bt.site_id = s.id;

CREATE VIEW public.vw_customer_items_on_approval
WITH (security_invoker = true)
AS
SELECT *
FROM public.vw_site_order_item_enriched
WHERE status IN ('pending_customer_approval', 'substitute_suggested');

CREATE VIEW public.vw_customer_finance_applications
WITH (security_invoker = true)
AS
SELECT
  fa.id,
  fa.customer_id,
  fa.site_id,
  s.site_code,
  s.site_name,
  fa.application_number,
  fa.requested_amount,
  fa.approved_amount,
  fa.tenure_months,
  fa.status,
  fa.remarks,
  fa.submitted_at,
  fa.reviewed_at,
  fa.created_at,
  fa.updated_at,
  fa.tenant_id
FROM public.finance_applications fa
LEFT JOIN public.sites s ON s.id = fa.site_id;

CREATE VIEW public.vw_electrician_new_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.status,
  s.description,
  s.created_at,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  customer.phone AS customer_phone,
  s.tenant_id
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
WHERE s.status = 'open_for_bidding'
  AND NOT EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = s.id
      AND sa.role = 'electrician'
      AND sa.status = 'active'
  );

CREATE VIEW public.vw_electrician_projects_assigned_to_others
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.status,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  assigned_electrician.id AS assigned_electrician_id,
  assigned_electrician.full_name AS assigned_electrician_name,
  s.tenant_id
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
JOIN public.site_assignments sa
  ON sa.site_id = s.id
 AND sa.role = 'electrician'
 AND sa.status = 'active'
JOIN public.users assigned_electrician ON assigned_electrician.id = sa.user_id
WHERE s.status IN ('assigned', 'in_progress', 'on_hold')
  AND assigned_electrician.role = 'electrician';

CREATE VIEW public.vw_electrician_ongoing_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status AS site_status,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  sa.user_id AS electrician_id,
  electrician.full_name AS electrician_name,
  architect.id AS architect_id,
  architect.full_name AS architect_name,
  COUNT(DISTINCT oi.id) AS total_material_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_architect_approval') AS architect_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_customer_approval') AS customer_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('approved_pending_supply', 'partially_supplied')) AS supply_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items,
  s.tenant_id
FROM public.site_assignments sa
JOIN public.sites s ON s.id = sa.site_id
JOIN public.users electrician ON electrician.id = sa.user_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.site_assignments sa_arch
  ON sa_arch.site_id = s.id
 AND sa_arch.role = 'architect'
 AND sa_arch.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_arch.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
WHERE sa.role = 'electrician'
  AND sa.status = 'active'
  AND s.status IN ('assigned', 'in_progress', 'on_hold')
GROUP BY
  s.id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status,
  customer.id,
  customer.full_name,
  sa.user_id,
  electrician.full_name,
  architect.id,
  architect.full_name;

CREATE VIEW public.vw_electrician_material_tracker
WITH (security_invoker = true)
AS
SELECT
  v.*,
  CASE WHEN v.status <> 'cancelled' THEN TRUE ELSE FALSE END AS in_master_requirement_list,
  CASE WHEN v.status = 'supplied' THEN TRUE ELSE FALSE END AS in_material_already_on_site,
  CASE WHEN v.status IN ('draft_by_electrician', 'draft_by_architect', 'approved_pending_shop_confirmation', 'approved_pending_supply', 'partially_supplied', 'substitute_suggested', 'substitute_accepted') THEN TRUE ELSE FALSE END AS in_pending_general,
  CASE WHEN v.status = 'pending_architect_approval' THEN TRUE ELSE FALSE END AS in_architect_approval_pending,
  CASE WHEN v.status = 'pending_customer_approval' THEN TRUE ELSE FALSE END AS in_customer_approval_pending,
  CASE WHEN v.status IN ('approved_pending_supply', 'partially_supplied') THEN TRUE ELSE FALSE END AS in_shop_supply_pending
FROM public.vw_site_order_item_enriched v
WHERE v.electrician_id IS NOT NULL;

CREATE VIEW public.vw_architect_new_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.status,
  s.description,
  s.created_at,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  customer.phone AS customer_phone,
  s.tenant_id
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
WHERE s.status = 'open_for_bidding'
  AND s.architect_required = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = s.id
      AND sa.role = 'architect'
      AND sa.status = 'active'
  );

CREATE VIEW public.vw_architect_ongoing_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status AS site_status,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  sa.user_id AS architect_id,
  architect.full_name AS architect_name,
  electrician.id AS electrician_id,
  electrician.full_name AS electrician_name,
  COUNT(DISTINCT oi.id) AS total_material_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_architect_approval') AS electrician_requested_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_customer_approval') AS customer_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('approved_pending_supply', 'partially_supplied')) AS supply_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items,
  s.tenant_id
FROM public.site_assignments sa
JOIN public.sites s ON s.id = sa.site_id
JOIN public.users architect ON architect.id = sa.user_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.site_assignments sa_ele
  ON sa_ele.site_id = s.id
 AND sa_ele.role = 'electrician'
 AND sa_ele.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_ele.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
WHERE sa.role = 'architect'
  AND sa.status = 'active'
  AND s.status IN ('assigned', 'in_progress', 'on_hold')
GROUP BY
  s.id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status,
  customer.id,
  customer.full_name,
  sa.user_id,
  architect.full_name,
  electrician.id,
  electrician.full_name;

CREATE VIEW public.vw_architect_material_tracker
WITH (security_invoker = true)
AS
SELECT
  v.*,
  CASE WHEN v.status <> 'cancelled' THEN TRUE ELSE FALSE END AS in_master_materials_required_list,
  CASE WHEN v.status = 'pending_architect_approval' THEN TRUE ELSE FALSE END AS in_materials_required_by_electrician,
  CASE WHEN v.status = 'supplied' THEN TRUE ELSE FALSE END AS in_material_already_supplied,
  CASE WHEN v.status = 'pending_customer_approval' THEN TRUE ELSE FALSE END AS in_architect_approved_pending_customer,
  CASE WHEN v.status IN ('approved_pending_supply', 'partially_supplied') THEN TRUE ELSE FALSE END AS in_completely_approved_pending_supply
FROM public.vw_site_order_item_enriched v
WHERE v.architect_id IS NOT NULL;

CREATE VIEW public.vw_product_requests_enriched
WITH (security_invoker = true)
AS
SELECT
  pr.id,
  pr.site_id,
  s.site_name,
  s.site_code,
  pr.requested_by_user_id,
  requester.full_name AS requested_by_name,
  pr.title,
  pr.preferred_category,
  pr.preferred_brand,
  pr.description,
  pr.status,
  pr.matched_product_id,
  p.item_name AS matched_product_name,
  pr.admin_notes,
  pr.ordered_at,
  pr.fulfilled_at,
  pr.created_at,
  pr.updated_at,
  pr.tenant_id
FROM public.product_requests pr
JOIN public.sites s ON s.id = pr.site_id
JOIN public.users requester ON requester.id = pr.requested_by_user_id
LEFT JOIN public.products p ON p.id = pr.matched_product_id;

CREATE VIEW public.vw_site_notes_enriched
WITH (security_invoker = true)
AS
SELECT
  sn.id,
  sn.site_id,
  s.site_name,
  s.site_code,
  sn.sender_user_id,
  sender.full_name AS sender_name,
  sn.recipient_role,
  sn.recipient_user_id,
  recipient.full_name AS recipient_name,
  sn.note_text,
  sn.created_at,
  sn.updated_at,
  sn.tenant_id
FROM public.site_notes sn
JOIN public.sites s ON s.id = sn.site_id
JOIN public.users sender ON sender.id = sn.sender_user_id
LEFT JOIN public.users recipient ON recipient.id = sn.recipient_user_id;

COMMIT;
