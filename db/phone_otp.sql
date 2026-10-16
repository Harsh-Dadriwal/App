-- Phone OTP (sent through TextBee)
-- Additive SQL migration. One-time sign-in codes for phone login/sign-up and per-number
-- daily send limits. Codes are stored only as SHA-256 hashes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.phone_otp_codes (
  phone TEXT PRIMARY KEY,                 -- E.164, e.g. +919876543210; one live code per number
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.phone_otp_daily_limits (
  phone TEXT NOT NULL,
  send_date DATE NOT NULL,                -- calendar day in India (Asia/Kolkata)
  send_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (phone, send_date)
);

-- No policies: only the API (service role) reads or writes these tables.
ALTER TABLE public.phone_otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_otp_daily_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.phone_otp_codes FROM anon, authenticated;
REVOKE ALL ON public.phone_otp_daily_limits FROM anon, authenticated;

-- Counts one more send for a number today and returns its new total and today's total
-- across all numbers, atomically, so concurrent requests cannot slip past the limits.
CREATE OR REPLACE FUNCTION public.register_phone_otp_send(p_phone TEXT)
RETURNS TABLE (phone_sends INTEGER, total_sends INTEGER)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
BEGIN
  INSERT INTO public.phone_otp_daily_limits AS l (phone, send_date, send_count)
  VALUES (p_phone, today, 1)
  ON CONFLICT (phone, send_date) DO UPDATE SET send_count = l.send_count + 1;

  RETURN QUERY
  SELECT
    (SELECT l.send_count FROM public.phone_otp_daily_limits l WHERE l.phone = p_phone AND l.send_date = today),
    (SELECT COALESCE(SUM(l.send_count), 0)::INTEGER FROM public.phone_otp_daily_limits l WHERE l.send_date = today);
END;
$$;

REVOKE ALL ON FUNCTION public.register_phone_otp_send(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_phone_otp_send(TEXT) TO service_role;

COMMIT;
