-- Product selections and partner incentives from shop orders
-- Additive SQL migration.
-- 1. Electricians and architects build product selections for a customer (linked by phone);
--    the customer orders or asks for a quotation from it in one tap, and admins see them all.
-- 2. Orders and quotations remember which electrician/architect brought them (partner_id).
-- 3. When an order is delivered, that partner earns incentives on its value (wires at the
--    wire %, everything else at the other %), with tiers and bonus points as before.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.product_selection_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.product_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  selection_number TEXT NOT NULL UNIQUE DEFAULT ('SEL-' || nextval('public.product_selection_number_seq')::TEXT),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  customer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  site_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ordered', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_selections_tenant ON public.product_selections (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_selections_creator ON public.product_selections (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_selections_customer ON public.product_selections (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_selection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id UUID NOT NULL REFERENCES public.product_selections(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  brand TEXT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_product_selection_items_selection ON public.product_selection_items (selection_id, position);

ALTER TABLE public.order_requests ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.order_requests ADD COLUMN IF NOT EXISTS selection_id UUID REFERENCES public.product_selections(id) ON DELETE SET NULL;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS selection_id UUID REFERENCES public.product_selections(id) ON DELETE SET NULL;
ALTER TABLE public.partner_commission_ledger ADD COLUMN IF NOT EXISTS order_request_id UUID REFERENCES public.order_requests(id) ON DELETE SET NULL;

ALTER TABLE public.product_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_selection_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_selections FROM anon, authenticated;
REVOKE ALL ON public.product_selection_items FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.product_selection_number_seq FROM anon, authenticated;

-- Credits the partner of a delivered order. Safe to call more than once: each part of an
-- order is credited once (idempotency keys), so re-running after a retry changes nothing.
CREATE OR REPLACE FUNCTION public.credit_partner_incentives_for_order_request(target_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ord RECORD;
  partner RECORD;
  part RECORD;
  scheme public.partner_incentive_schemes;
  current_slab public.partner_incentive_slabs;
  previous_slab_id UUID;
  summary_row public.partner_business_summary;
  v_year INTEGER := EXTRACT(YEAR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::INTEGER;
  v_percent NUMERIC(6,3);
  v_amount NUMERIC(14,2);
  v_key TEXT;
BEGIN
  SELECT o.id, o.tenant_id, o.order_number, o.partner_id, o.status INTO ord
  FROM public.order_requests o WHERE o.id = target_order_id;
  IF ord.id IS NULL OR ord.partner_id IS NULL OR ord.status <> 'delivered' THEN
    RETURN;
  END IF;

  SELECT u.id, u.role::TEXT AS partner_type INTO partner
  FROM public.users u WHERE u.id = ord.partner_id AND u.role::TEXT IN ('electrician', 'architect');
  IF partner.id IS NULL THEN
    RETURN;
  END IF;

  scheme := public.get_active_partner_incentive_scheme(ord.tenant_id, partner.partner_type);
  IF scheme.id IS NULL THEN
    RETURN;
  END IF;

  -- Wires earn the wire %, every other category the other %.
  FOR part IN
    SELECT CASE WHEN i.category = 'Wires & Cables' THEN 'WIRE' ELSE 'OTHER' END AS commission_type,
           ROUND(SUM(i.quantity * i.unit_price)::NUMERIC, 2) AS business_amount
    FROM public.order_request_items i
    WHERE i.order_request_id = ord.id
    GROUP BY 1
    HAVING SUM(i.quantity * i.unit_price) > 0
  LOOP
    v_key := 'order_request:' || ord.id::TEXT || ':' || part.commission_type;
    IF EXISTS (SELECT 1 FROM public.partner_commission_ledger l WHERE l.tenant_id = ord.tenant_id AND l.idempotency_key = v_key) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.partner_business_summary (tenant_id, partner_id, scheme_id, business_year)
    VALUES (ord.tenant_id, partner.id, scheme.id, v_year)
    ON CONFLICT (tenant_id, partner_id, business_year) DO NOTHING;

    SELECT current_slab_id INTO previous_slab_id
    FROM public.partner_business_summary s
    WHERE s.tenant_id = ord.tenant_id AND s.partner_id = partner.id AND s.business_year = v_year;

    UPDATE public.partner_business_summary s
    SET scheme_id = scheme.id,
        wire_business = wire_business + CASE WHEN part.commission_type = 'WIRE' THEN part.business_amount ELSE 0 END,
        other_business = other_business + CASE WHEN part.commission_type = 'OTHER' THEN part.business_amount ELSE 0 END,
        total_business = total_business + part.business_amount,
        updated_at = NOW()
    WHERE s.tenant_id = ord.tenant_id AND s.partner_id = partner.id AND s.business_year = v_year
    RETURNING * INTO summary_row;

    SELECT * INTO current_slab
    FROM public.partner_incentive_slabs sl
    WHERE sl.scheme_id = scheme.id
      AND sl.is_active = TRUE
      AND summary_row.total_business >= sl.min_business
      AND (sl.max_business IS NULL OR summary_row.total_business < sl.max_business)
    ORDER BY sl.min_business DESC
    LIMIT 1;
    IF current_slab.id IS NULL THEN
      CONTINUE;
    END IF;

    v_percent := CASE WHEN part.commission_type = 'WIRE' THEN current_slab.wire_commission_percent ELSE current_slab.other_commission_percent END;
    v_amount := ROUND((part.business_amount * v_percent / 100)::NUMERIC, 2);

    INSERT INTO public.partner_commission_ledger (
      tenant_id, partner_id, scheme_id, slab_id, order_request_id, entry_type,
      commission_type, business_amount, commission_percent, commission_amount, points, description, idempotency_key
    ) VALUES (
      ord.tenant_id, partner.id, scheme.id, current_slab.id, ord.id, 'commission',
      part.commission_type, part.business_amount, v_percent, v_amount, 0,
      'Incentive for delivered order ' || ord.order_number || CASE WHEN part.commission_type = 'WIRE' THEN ' (wires)' ELSE '' END,
      v_key
    );

    UPDATE public.partner_business_summary
    SET current_slab_id = current_slab.id,
        commission_earned = commission_earned + v_amount,
        updated_at = NOW()
    WHERE id = summary_row.id;

    IF previous_slab_id IS DISTINCT FROM current_slab.id THEN
      INSERT INTO public.partner_slab_history (
        tenant_id, partner_id, scheme_id, from_slab_id, to_slab_id, business_year, business_amount, bonus_points_awarded
      ) VALUES (
        ord.tenant_id, partner.id, scheme.id, previous_slab_id, current_slab.id, v_year, summary_row.total_business, current_slab.bonus_points
      ) ON CONFLICT (tenant_id, partner_id, scheme_id, to_slab_id, business_year) DO NOTHING;

      IF FOUND AND current_slab.bonus_points > 0 THEN
        INSERT INTO public.partner_commission_ledger (
          tenant_id, partner_id, scheme_id, slab_id, order_request_id, entry_type,
          business_amount, commission_percent, commission_amount, points, description, idempotency_key
        ) VALUES (
          ord.tenant_id, partner.id, scheme.id, current_slab.id, ord.id, 'bonus_points',
          0, 0, 0, current_slab.bonus_points, 'Tier bonus awarded: ' || current_slab.tier_name,
          'bonus:' || scheme.id::TEXT || ':' || current_slab.id::TEXT || ':' || partner.id::TEXT || ':' || v_year::TEXT
        ) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING;

        INSERT INTO public.partner_points_wallet (tenant_id, partner_id, points_balance, lifetime_points)
        VALUES (ord.tenant_id, partner.id, current_slab.bonus_points, current_slab.bonus_points)
        ON CONFLICT (tenant_id, partner_id) DO UPDATE
        SET points_balance = public.partner_points_wallet.points_balance + EXCLUDED.points_balance,
            lifetime_points = public.partner_points_wallet.lifetime_points + EXCLUDED.lifetime_points,
            updated_at = NOW();

        UPDATE public.partner_business_summary
        SET bonus_points_earned = bonus_points_earned + current_slab.bonus_points, updated_at = NOW()
        WHERE id = summary_row.id;
      END IF;

      INSERT INTO public.notifications (tenant_id, user_id, type, title, body, data)
      VALUES (
        ord.tenant_id, partner.id, 'general', 'Partner tier updated',
        'You are now in ' || current_slab.tier_name || ' tier. Bonus points: ' || current_slab.bonus_points::TEXT,
        jsonb_build_object('module', 'partner_incentives', 'scheme_id', scheme.id, 'slab_id', current_slab.id, 'business_year', v_year)
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_partner_incentives_for_order_request(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_partner_incentives_for_order_request(UUID) TO service_role;

COMMIT;
