-- Partner Incentive Engine
-- Additive SQL migration. Reuses users, site_orders, order_items, products, product_categories, notifications, and tenant RLS helpers.

BEGIN;

ALTER TABLE public.product_categories
  ADD COLUMN IF NOT EXISTS commission_type TEXT NOT NULL DEFAULT 'OTHER'
  CHECK (commission_type IN ('WIRE', 'OTHER'));

CREATE INDEX IF NOT EXISTS idx_product_categories_commission_type
  ON public.product_categories (tenant_id, commission_type);

CREATE TABLE IF NOT EXISTS public.partner_incentive_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  partner_type TEXT NOT NULL DEFAULT 'all',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  description TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_partner_scheme_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_partner_scheme_per_type
  ON public.partner_incentive_schemes (tenant_id, lower(partner_type))
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_partner_incentive_schemes_tenant_status
  ON public.partner_incentive_schemes (tenant_id, status, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.partner_incentive_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scheme_id UUID NOT NULL REFERENCES public.partner_incentive_schemes(id) ON DELETE CASCADE,
  tier_name TEXT NOT NULL,
  min_business NUMERIC(14,2) NOT NULL CHECK (min_business >= 0),
  max_business NUMERIC(14,2) CHECK (max_business IS NULL OR max_business > min_business),
  wire_commission_percent NUMERIC(6,3) NOT NULL CHECK (wire_commission_percent >= 0),
  other_commission_percent NUMERIC(6,3) NOT NULL CHECK (other_commission_percent >= 0),
  bonus_points INTEGER NOT NULL DEFAULT 0 CHECK (bonus_points >= 0),
  color TEXT,
  icon TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_incentive_slabs_scheme_order
  ON public.partner_incentive_slabs (scheme_id, sort_order, min_business);
CREATE INDEX IF NOT EXISTS idx_partner_incentive_slabs_tenant_range
  ON public.partner_incentive_slabs (tenant_id, scheme_id, min_business, max_business);

CREATE TABLE IF NOT EXISTS public.partner_business_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheme_id UUID REFERENCES public.partner_incentive_schemes(id) ON DELETE SET NULL,
  current_slab_id UUID REFERENCES public.partner_incentive_slabs(id) ON DELETE SET NULL,
  business_year INTEGER NOT NULL,
  wire_business NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (wire_business >= 0),
  other_business NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_business >= 0),
  total_business NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_business >= 0),
  commission_earned NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (commission_earned >= 0),
  bonus_points_earned INTEGER NOT NULL DEFAULT 0 CHECK (bonus_points_earned >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, partner_id, business_year)
);

CREATE INDEX IF NOT EXISTS idx_partner_business_summary_tenant_year
  ON public.partner_business_summary (tenant_id, business_year, total_business DESC);

CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheme_id UUID REFERENCES public.partner_incentive_schemes(id) ON DELETE SET NULL,
  slab_id UUID REFERENCES public.partner_incentive_slabs(id) ON DELETE SET NULL,
  site_order_id UUID REFERENCES public.site_orders(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('business', 'commission', 'bonus_points', 'redemption', 'adjustment')),
  commission_type TEXT CHECK (commission_type IN ('WIRE', 'OTHER')),
  business_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (business_amount >= 0),
  commission_percent NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (commission_percent >= 0),
  commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  points INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  idempotency_key TEXT NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_partner_commission_ledger_partner_posted
  ON public.partner_commission_ledger (tenant_id, partner_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_commission_ledger_order_item
  ON public.partner_commission_ledger (order_item_id, partner_id);

CREATE TABLE IF NOT EXISTS public.partner_points_wallet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  lifetime_points INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, partner_id)
);

CREATE TABLE IF NOT EXISTS public.partner_reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK (points > 0),
  reward_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected', 'fulfilled', 'cancelled')),
  notes TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_partner_reward_redemptions_partner
  ON public.partner_reward_redemptions (tenant_id, partner_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_slab_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheme_id UUID NOT NULL REFERENCES public.partner_incentive_schemes(id) ON DELETE CASCADE,
  from_slab_id UUID REFERENCES public.partner_incentive_slabs(id) ON DELETE SET NULL,
  to_slab_id UUID NOT NULL REFERENCES public.partner_incentive_slabs(id) ON DELETE CASCADE,
  business_year INTEGER NOT NULL,
  business_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus_points_awarded INTEGER NOT NULL DEFAULT 0,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, partner_id, scheme_id, to_slab_id, business_year)
);

CREATE TABLE IF NOT EXISTS public.partner_scheme_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scheme_id UUID NOT NULL REFERENCES public.partner_incentive_schemes(id) ON DELETE CASCADE,
  partner_type TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'activated', 'archived', 'deleted')),
  changed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE VIEW public.vw_partner_incentive_progress WITH (security_invoker = true) AS
SELECT
  pbs.tenant_id,
  pbs.partner_id,
  u.full_name AS partner_name,
  u.role::text AS partner_type,
  pbs.business_year,
  pbs.scheme_id,
  pis.name AS scheme_name,
  pbs.current_slab_id,
  slab.tier_name AS current_tier,
  slab.color AS current_tier_color,
  slab.icon AS current_tier_icon,
  pbs.wire_business,
  pbs.other_business,
  pbs.total_business,
  pbs.commission_earned,
  COALESCE(ppw.points_balance, 0) AS current_points,
  next_slab.id AS next_slab_id,
  next_slab.tier_name AS next_tier,
  next_slab.min_business AS next_tier_min_business,
  GREATEST(COALESCE(next_slab.min_business, pbs.total_business) - pbs.total_business, 0) AS business_to_next_tier
FROM public.partner_business_summary pbs
JOIN public.users u ON u.id = pbs.partner_id
LEFT JOIN public.partner_incentive_schemes pis ON pis.id = pbs.scheme_id
LEFT JOIN public.partner_incentive_slabs slab ON slab.id = pbs.current_slab_id
LEFT JOIN public.partner_points_wallet ppw ON ppw.tenant_id = pbs.tenant_id AND ppw.partner_id = pbs.partner_id
LEFT JOIN LATERAL (
  SELECT s.*
  FROM public.partner_incentive_slabs s
  WHERE s.scheme_id = pbs.scheme_id
    AND s.is_active = TRUE
    AND s.min_business > pbs.total_business
  ORDER BY s.min_business ASC
  LIMIT 1
) next_slab ON TRUE;

CREATE OR REPLACE VIEW public.vw_partner_incentive_reports WITH (security_invoker = true) AS
SELECT
  pbs.tenant_id,
  pbs.business_year,
  pbs.partner_id,
  u.full_name AS partner_name,
  u.role::text AS partner_type,
  slab.tier_name,
  pbs.total_business,
  pbs.wire_business,
  pbs.other_business,
  pbs.commission_earned,
  pbs.bonus_points_earned,
  COALESCE(ppw.points_balance, 0) AS current_points
FROM public.partner_business_summary pbs
JOIN public.users u ON u.id = pbs.partner_id
LEFT JOIN public.partner_incentive_slabs slab ON slab.id = pbs.current_slab_id
LEFT JOIN public.partner_points_wallet ppw ON ppw.tenant_id = pbs.tenant_id AND ppw.partner_id = pbs.partner_id;

CREATE OR REPLACE FUNCTION public.get_active_partner_incentive_scheme(target_tenant_id UUID, target_partner_type TEXT)
RETURNS public.partner_incentive_schemes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.partner_incentive_schemes s
  WHERE s.tenant_id = target_tenant_id
    AND s.status = 'active'
    AND lower(s.partner_type) IN (lower(target_partner_type), 'all')
    AND s.effective_from <= CURRENT_DATE
    AND (s.effective_to IS NULL OR s.effective_to >= CURRENT_DATE)
  ORDER BY CASE WHEN lower(s.partner_type) = lower(target_partner_type) THEN 0 ELSE 1 END, s.effective_from DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.process_partner_incentives_for_order_item(target_order_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  partner RECORD;
  scheme public.partner_incentive_schemes;
  current_slab public.partner_incentive_slabs;
  previous_slab_id UUID;
  v_business_year INTEGER;
  v_business_amount NUMERIC(14,2);
  v_category_commission_type TEXT;
  v_commission_percent NUMERIC(6,3);
  v_commission_amount NUMERIC(14,2);
  summary_row public.partner_business_summary;
  v_idempotency_key TEXT;
BEGIN
  SELECT
    oi.id,
    oi.site_order_id,
    oi.tenant_id,
    oi.line_total,
    oi.quantity_supplied,
    oi.quantity_required,
    oi.supplied_at,
    so.architect_id,
    so.electrician_id,
    pc.commission_type
  INTO item
  FROM public.order_items oi
  JOIN public.site_orders so ON so.id = oi.site_order_id
  JOIN public.products p ON p.id = oi.product_id
  JOIN public.product_categories pc ON pc.id = p.category_id
  WHERE oi.id = target_order_item_id
    AND oi.status = 'supplied';

  IF item.id IS NULL THEN
    RETURN;
  END IF;

  v_business_year := EXTRACT(YEAR FROM COALESCE(item.supplied_at, NOW()))::INTEGER;
  v_business_amount := COALESCE(item.line_total, 0);
  v_category_commission_type := COALESCE(item.commission_type, 'OTHER');

  FOR partner IN
    SELECT DISTINCT u.id, u.role::text AS partner_type
    FROM public.users u
    WHERE u.id IN (item.architect_id, item.electrician_id)
      AND u.role::text NOT IN ('admin', 'customer', 'supplier')
  LOOP
    scheme := public.get_active_partner_incentive_scheme(item.tenant_id, partner.partner_type);
    IF scheme.id IS NULL THEN
      CONTINUE;
    END IF;

    v_idempotency_key := 'order_item:' || item.id::text || ':partner:' || partner.id::text;
    IF EXISTS (SELECT 1 FROM public.partner_commission_ledger pcl WHERE pcl.tenant_id = item.tenant_id AND pcl.idempotency_key = v_idempotency_key) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.partner_business_summary (tenant_id, partner_id, scheme_id, business_year)
    VALUES (item.tenant_id, partner.id, scheme.id, v_business_year)
    ON CONFLICT (tenant_id, partner_id, business_year) DO NOTHING;

    SELECT current_slab_id INTO previous_slab_id
    FROM public.partner_business_summary
    WHERE tenant_id = item.tenant_id AND partner_id = partner.id AND partner_business_summary.business_year = v_business_year;

    UPDATE public.partner_business_summary
    SET
      scheme_id = scheme.id,
      wire_business = wire_business + CASE WHEN v_category_commission_type = 'WIRE' THEN v_business_amount ELSE 0 END,
      other_business = other_business + CASE WHEN v_category_commission_type = 'OTHER' THEN v_business_amount ELSE 0 END,
      total_business = total_business + v_business_amount,
      updated_at = NOW()
    WHERE tenant_id = item.tenant_id AND partner_id = partner.id AND partner_business_summary.business_year = v_business_year
    RETURNING * INTO summary_row;

    SELECT * INTO current_slab
    FROM public.partner_incentive_slabs s
    WHERE s.scheme_id = scheme.id
      AND s.is_active = TRUE
      AND summary_row.total_business >= s.min_business
      AND (s.max_business IS NULL OR summary_row.total_business < s.max_business)
    ORDER BY s.min_business DESC
    LIMIT 1;

    IF current_slab.id IS NULL THEN
      CONTINUE;
    END IF;

    v_commission_percent := CASE WHEN v_category_commission_type = 'WIRE' THEN current_slab.wire_commission_percent ELSE current_slab.other_commission_percent END;
    v_commission_amount := ROUND((v_business_amount * v_commission_percent / 100)::numeric, 2);

    INSERT INTO public.partner_commission_ledger (
      tenant_id, partner_id, scheme_id, slab_id, site_order_id, order_item_id, entry_type,
      commission_type, business_amount, commission_percent, commission_amount, points, description, idempotency_key
    ) VALUES (
      item.tenant_id, partner.id, scheme.id, current_slab.id, item.site_order_id, item.id, 'commission',
      v_category_commission_type, v_business_amount, v_commission_percent, v_commission_amount, 0,
      'Commission for supplied order item', v_idempotency_key
    );

    UPDATE public.partner_business_summary
    SET current_slab_id = current_slab.id,
        commission_earned = commission_earned + v_commission_amount,
        updated_at = NOW()
    WHERE id = summary_row.id;

    IF previous_slab_id IS DISTINCT FROM current_slab.id THEN
      INSERT INTO public.partner_slab_history (
        tenant_id, partner_id, scheme_id, from_slab_id, to_slab_id, business_year, business_amount, bonus_points_awarded
      ) VALUES (
        item.tenant_id, partner.id, scheme.id, previous_slab_id, current_slab.id, v_business_year, summary_row.total_business, current_slab.bonus_points
      ) ON CONFLICT (tenant_id, partner_id, scheme_id, to_slab_id, business_year) DO NOTHING;

      IF FOUND AND current_slab.bonus_points > 0 THEN
        INSERT INTO public.partner_commission_ledger (
          tenant_id, partner_id, scheme_id, slab_id, site_order_id, order_item_id, entry_type,
          business_amount, commission_percent, commission_amount, points, description, idempotency_key
        ) VALUES (
          item.tenant_id, partner.id, scheme.id, current_slab.id, item.site_order_id, item.id, 'bonus_points',
          0, 0, 0, current_slab.bonus_points, 'Tier bonus awarded: ' || current_slab.tier_name,
          'bonus:' || scheme.id::text || ':' || current_slab.id::text || ':' || partner.id::text || ':' || v_business_year::text
        ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

        INSERT INTO public.partner_points_wallet (tenant_id, partner_id, points_balance, lifetime_points)
        VALUES (item.tenant_id, partner.id, current_slab.bonus_points, current_slab.bonus_points)
        ON CONFLICT (tenant_id, partner_id) DO UPDATE
        SET points_balance = public.partner_points_wallet.points_balance + EXCLUDED.points_balance,
            lifetime_points = public.partner_points_wallet.lifetime_points + EXCLUDED.lifetime_points,
            updated_at = NOW();

        UPDATE public.partner_business_summary
        SET bonus_points_earned = bonus_points_earned + current_slab.bonus_points,
            updated_at = NOW()
        WHERE id = summary_row.id;
      END IF;

      INSERT INTO public.notifications (tenant_id, user_id, type, title, body, data)
      VALUES (
        item.tenant_id,
        partner.id,
        'general',
        'Partner tier updated',
        'You are now in ' || current_slab.tier_name || ' tier. Bonus points: ' || current_slab.bonus_points::text,
        jsonb_build_object('module', 'partner_incentives', 'scheme_id', scheme.id, 'slab_id', current_slab.id, 'business_year', v_business_year)
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_partner_incentive_order_item_supplied()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'supplied' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.process_partner_incentives_for_order_item(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_incentive_order_item_supplied ON public.order_items;
CREATE TRIGGER trg_partner_incentive_order_item_supplied
AFTER UPDATE OF status ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_partner_incentive_order_item_supplied();

DROP TRIGGER IF EXISTS trg_partner_incentive_schemes_updated_at ON public.partner_incentive_schemes;
CREATE TRIGGER trg_partner_incentive_schemes_updated_at BEFORE UPDATE ON public.partner_incentive_schemes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_partner_incentive_slabs_updated_at ON public.partner_incentive_slabs;
CREATE TRIGGER trg_partner_incentive_slabs_updated_at BEFORE UPDATE ON public.partner_incentive_slabs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_partner_business_summary_updated_at ON public.partner_business_summary;
CREATE TRIGGER trg_partner_business_summary_updated_at BEFORE UPDATE ON public.partner_business_summary FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_partner_points_wallet_updated_at ON public.partner_points_wallet;
CREATE TRIGGER trg_partner_points_wallet_updated_at BEFORE UPDATE ON public.partner_points_wallet FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.partner_incentive_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_incentive_slabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_business_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_points_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_reward_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_slab_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_scheme_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY partner_incentive_schemes_read ON public.partner_incentive_schemes FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));
CREATE POLICY partner_incentive_schemes_admin_write ON public.partner_incentive_schemes FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

CREATE POLICY partner_incentive_slabs_read ON public.partner_incentive_slabs FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));
CREATE POLICY partner_incentive_slabs_admin_write ON public.partner_incentive_slabs FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

CREATE POLICY partner_business_summary_read ON public.partner_business_summary FOR SELECT TO authenticated
USING (public.is_admin_user() OR partner_id = public.current_profile_id());
CREATE POLICY partner_business_summary_admin_write ON public.partner_business_summary FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

CREATE POLICY partner_commission_ledger_read ON public.partner_commission_ledger FOR SELECT TO authenticated
USING (public.is_admin_user() OR partner_id = public.current_profile_id());
CREATE POLICY partner_commission_ledger_admin_write ON public.partner_commission_ledger FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

CREATE POLICY partner_points_wallet_read ON public.partner_points_wallet FOR SELECT TO authenticated
USING (public.is_admin_user() OR partner_id = public.current_profile_id());
CREATE POLICY partner_points_wallet_admin_write ON public.partner_points_wallet FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

CREATE POLICY partner_reward_redemptions_read ON public.partner_reward_redemptions FOR SELECT TO authenticated
USING (public.is_admin_user() OR partner_id = public.current_profile_id());
CREATE POLICY partner_reward_redemptions_insert_self ON public.partner_reward_redemptions FOR INSERT TO authenticated
WITH CHECK (partner_id = public.current_profile_id() AND public.can_access_tenant(tenant_id));
CREATE POLICY partner_reward_redemptions_admin_update ON public.partner_reward_redemptions FOR UPDATE TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

CREATE POLICY partner_slab_history_read ON public.partner_slab_history FOR SELECT TO authenticated
USING (public.is_admin_user() OR partner_id = public.current_profile_id());
CREATE POLICY partner_slab_history_admin_write ON public.partner_slab_history FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

CREATE POLICY partner_scheme_history_admin_read ON public.partner_scheme_history FOR SELECT TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id));
CREATE POLICY partner_scheme_history_admin_write ON public.partner_scheme_history FOR ALL TO authenticated
USING (public.is_admin_user() AND public.can_access_tenant(tenant_id))
WITH CHECK (public.is_admin_user() AND public.can_access_tenant(tenant_id));

INSERT INTO public.partner_incentive_schemes (tenant_id, name, partner_type, status, description)
SELECT t.id, 'Default Partner Incentive Scheme', 'all', 'active', 'Default slab configuration for partner incentives.'
FROM public.tenants t
ON CONFLICT DO NOTHING;

INSERT INTO public.partner_incentive_slabs (
  tenant_id, scheme_id, tier_name, min_business, max_business, wire_commission_percent, other_commission_percent,
  bonus_points, color, icon, description, sort_order
)
SELECT scheme.tenant_id, scheme.id, slab.tier_name, slab.min_business, slab.max_business, 2, 10,
       slab.bonus_points, slab.color, slab.icon, slab.description, slab.sort_order
FROM public.partner_incentive_schemes scheme
CROSS JOIN (VALUES
  ('Bronze', 0::numeric, 500000::numeric, 0, '#b45309', 'award', 'Entry tier for new partners.', 10),
  ('Silver', 500000::numeric, 1000000::numeric, 5000, '#64748b', 'star', 'Growth tier with first bonus.', 20),
  ('Gold', 1000000::numeric, 2000000::numeric, 12000, '#ca8a04', 'zap', 'High-performing partner tier.', 30),
  ('Platinum', 2000000::numeric, 4000000::numeric, 30000, '#475569', 'shield', 'Premium annual business tier.', 40),
  ('Diamond', 4000000::numeric, NULL::numeric, 75000, '#2563eb', 'diamond', 'Top annual partner tier.', 50)
) AS slab(tier_name, min_business, max_business, bonus_points, color, icon, description, sort_order)
WHERE scheme.name = 'Default Partner Incentive Scheme'
ON CONFLICT DO NOTHING;

COMMIT;
