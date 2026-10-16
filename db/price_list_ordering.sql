-- Ordering from the Tally price list
-- Additive SQL migration. Customers, electricians and architects add in-stock price list
-- items to a cart and send an order request; the shop confirms it and settles prices at
-- billing. Also records the last price list sync so unchanged Tally exports are skipped
-- and the app can tell cheaply whether its copy is still current.

BEGIN;

-- One row per tenant: the fingerprint of the last imported export and when it was checked.
CREATE TABLE IF NOT EXISTS public.price_list_sync_state (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- when the items last changed
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- when Drive was last read
  last_error TEXT
);

INSERT INTO public.price_list_sync_state (tenant_id, item_count, synced_at, checked_at)
SELECT tenant_id, COUNT(*), MAX(synced_at), MAX(synced_at)
FROM public.price_list_items
GROUP BY tenant_id
ON CONFLICT (tenant_id) DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS public.order_request_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.order_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL UNIQUE DEFAULT ('ORD-' || nextval('public.order_request_number_seq')::TEXT),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'confirmed', 'ready', 'delivered', 'cancelled')),
  delivery_address TEXT NOT NULL DEFAULT '',
  contact_phone TEXT,
  note TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_requests_tenant_created ON public.order_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_requests_customer ON public.order_requests (customer_id, created_at DESC);

-- Items are copied from the price list at order time: the list is replaced on every
-- sync, so nothing here references price_list_items. Prices are shown only to admins.
CREATE TABLE IF NOT EXISTS public.order_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_request_id UUID NOT NULL REFERENCES public.order_requests(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  brand TEXT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL DEFAULT 0,
  mrp NUMERIC NOT NULL DEFAULT 0,
  stock_label TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_order_request_items_order ON public.order_request_items (order_request_id);

-- No policies: only the API (service role) reads or writes these, so prices never reach
-- a customer's browser.
ALTER TABLE public.price_list_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_request_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.price_list_sync_state FROM anon, authenticated;
REVOKE ALL ON public.order_requests FROM anon, authenticated;
REVOKE ALL ON public.order_request_items FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.order_request_number_seq FROM anon, authenticated;

-- For the 15-minute automatic price list sync (scheduled in db/price_list_auto_sync.sql).
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

COMMIT;
