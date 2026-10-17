-- Quotations
-- Additive SQL migration. Customers, electricians and architects ask for a quotation by
-- picking price list items and/or uploading photos of their requirement list. The shop
-- prices it (filled in from the Tally price list, editable, with an optional discount)
-- and sends it; the person accepts it, which turns it into an order request.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.quotation_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  quotation_number TEXT NOT NULL UNIQUE DEFAULT ('QT-' || nextval('public.quotation_number_seq')::TEXT),
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'quoted', 'accepted', 'declined', 'cancelled')),
  note TEXT,
  contact_phone TEXT,
  -- Storage keys of uploaded requirement photos (private bucket, read through signed links).
  photo_keys TEXT[] NOT NULL DEFAULT '{}',
  discount_amount NUMERIC NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  admin_note TEXT,
  valid_until DATE,
  quoted_at TIMESTAMPTZ,
  order_request_id UUID REFERENCES public.order_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotations_tenant_created ON public.quotations (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_customer ON public.quotations (customer_id, created_at DESC);

-- Lines are copied from the price list (it is replaced on every sync). item_key is empty
-- for lines the shop typed in that are not in the price list.
CREATE TABLE IF NOT EXISTS public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  item_key TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  brand TEXT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  mrp NUMERIC NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation ON public.quotation_items (quotation_id, position);

-- Order lines from an accepted quotation keep the quoted price.
ALTER TABLE public.order_request_items ALTER COLUMN item_key SET DEFAULT '';

-- No policies: only the API (service role) reads or writes these.
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quotations FROM anon, authenticated;
REVOKE ALL ON public.quotation_items FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.quotation_number_seq FROM anon, authenticated;

COMMIT;
