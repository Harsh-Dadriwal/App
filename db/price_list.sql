-- Price List
-- Additive SQL migration. Reuses tenants. Holds the Tally-exported retail price list
-- (category -> group -> item, with final price, MRP, cost price and a free-text stock label).

BEGIN;

-- Fully replaced on every admin-triggered sync rather than upserted: the Tally export
-- has no stable id to match rows against, and nothing references these rows by id.
CREATE TABLE IF NOT EXISTS public.price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT '',
  group_name TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL,
  final_price NUMERIC NOT NULL DEFAULT 0,
  mrp NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  stock_label TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_list_items_tenant_browse
  ON public.price_list_items (tenant_id, category, group_name, item_name);

-- Hero image shown on the customer-facing price view, one per price list category.
CREATE TABLE IF NOT EXISTS public.price_list_categories (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  image_url TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, category)
);

-- No policies on purpose: cost_price must never reach a browser directly, so both
-- tables are readable only through the API (service role), which strips cost_price
-- for non-admins.
ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_list_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_list_items FROM anon, authenticated;
REVOKE ALL ON public.price_list_categories FROM anon, authenticated;

-- Atomically swaps a tenant's whole price list for a freshly parsed snapshot.
CREATE OR REPLACE FUNCTION public.replace_price_list(p_tenant_id UUID, p_items JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  DELETE FROM public.price_list_items WHERE tenant_id = p_tenant_id;

  INSERT INTO public.price_list_items (tenant_id, category, group_name, item_name, final_price, mrp, cost_price, stock_label)
  SELECT
    p_tenant_id,
    COALESCE(item.category, ''),
    COALESCE(item.group_name, ''),
    item.item_name,
    COALESCE(item.final_price, 0),
    COALESCE(item.mrp, 0),
    COALESCE(item.cost_price, 0),
    COALESCE(item.stock_label, '')
  FROM jsonb_to_recordset(p_items) AS item(
    category TEXT,
    group_name TEXT,
    item_name TEXT,
    final_price NUMERIC,
    mrp NUMERIC,
    cost_price NUMERIC,
    stock_label TEXT
  )
  WHERE item.item_name IS NOT NULL AND item.item_name <> '';

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_price_list(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_price_list(UUID, JSONB) TO service_role;

COMMIT;
