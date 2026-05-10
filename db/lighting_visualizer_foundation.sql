BEGIN;

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

COMMIT;
