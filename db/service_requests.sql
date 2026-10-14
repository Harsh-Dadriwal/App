-- Service Requests
-- Additive SQL migration. Reuses tenants, users and notifications.
-- A customer raises a complaint or an installation request, every electrician in the
-- workspace is notified and can offer to take it, and the customer picks one of them.

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('complaint', 'installation')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 150),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  address TEXT NOT NULL,
  city TEXT,
  contact_phone TEXT,
  preferred_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_electrician_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_service_request_assignment CHECK (status IN ('open', 'cancelled') OR assigned_electrician_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_service_requests_tenant_status
  ON public.service_requests (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_customer
  ON public.service_requests (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_assignee
  ON public.service_requests (assigned_electrician_id, created_at DESC);

-- One row per electrician who offers to take a request.
CREATE TABLE IF NOT EXISTS public.service_request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  electrician_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message TEXT,
  quoted_amount NUMERIC(14, 2) CHECK (quoted_amount IS NULL OR quoted_amount >= 0),
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'chosen', 'not_chosen')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_request_id, electrician_id)
);

CREATE INDEX IF NOT EXISTS idx_service_request_responses_electrician
  ON public.service_request_responses (electrician_id, created_at DESC);

-- No policies on purpose: requests hold customer addresses and phone numbers, which the
-- API only reveals to the customer, the chosen electrician and admins. All access goes
-- through the API (service role).
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_requests FROM anon, authenticated;
REVOKE ALL ON public.service_request_responses FROM anon, authenticated;

COMMIT;
