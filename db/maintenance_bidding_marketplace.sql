BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'bid_status'
  ) THEN
    CREATE TYPE public.bid_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  handyman_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  estimated_days integer NOT NULL CHECK (estimated_days > 0),
  status public.bid_status NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, handyman_id)
);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS budget_range numeric(12,2),
  ADD COLUMN IF NOT EXISTS max_budget numeric(12,2),
  ADD COLUMN IF NOT EXISTS assigned_handyman_id uuid REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS assignment_deadline timestamptz;

CREATE INDEX IF NOT EXISTS idx_bids_task_status_created
  ON public.bids (task_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bids_handyman_status
  ON public.bids (handyman_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_category_status
  ON public.tasks (tenant_id, category, status);

COMMIT;
