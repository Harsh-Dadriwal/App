-- Add status field to leads table and create indexes for B2B pipeline monitoring

BEGIN;

-- 1. Create the lead status enumeration type if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'quoted', 'sample_dispatched', 'won', 'lost');
  END IF;
END
$$;

-- 2. Add the flat status column to your leads table with default 'new'
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS status public.lead_status NOT NULL DEFAULT 'new';

-- 3. Sync existing leads data by extracting the status from their configuration JSONB if present
UPDATE public.leads 
SET status = COALESCE(
  CASE 
    WHEN configuration->>'status' IN ('new', 'contacted', 'quoted', 'sample_dispatched', 'won', 'lost') 
    THEN (configuration->>'status')::public.lead_status
    ELSE 'new'::public.lead_status
  END, 
  'new'::public.lead_status
);

-- 4. Create a high-performance B-Tree index for rapid filtering and dashboard rendering
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);

COMMIT;
