-- Contractor Credit Engine Migration Schema
-- Idempotent script for Supabase PostgreSQL

-- 1. Create contractors table (one-to-one relationship with public.users)
CREATE TABLE IF NOT EXISTS public.contractors (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  credit_limit NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (credit_limit >= 0),
  available_credit NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (available_credit >= 0),
  risk_score INTEGER NOT NULL DEFAULT 100 CHECK (risk_score >= 0 AND risk_score <= 100),
  credit_status VARCHAR(20) NOT NULL DEFAULT 'red' CHECK (credit_status IN ('green', 'yellow', 'orange', 'red')),
  credit_version INTEGER NOT NULL DEFAULT 1,
  is_frozen BOOLEAN NOT NULL DEFAULT false,
  last_credit_review TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 2. Create credit_profiles table (stores metrics used for scoring)
CREATE TABLE IF NOT EXISTS public.credit_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  annual_purchase_volume NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (annual_purchase_volume >= 0),
  active_project_value NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (active_project_value >= 0),
  outstanding_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (outstanding_amount >= 0),
  average_payment_delay_days NUMERIC(6, 2) NOT NULL DEFAULT 0.00 CHECK (average_payment_delay_days >= 0),
  on_time_payment_percentage NUMERIC(5, 2) NOT NULL DEFAULT 100.00 CHECK (on_time_payment_percentage >= 0 AND on_time_payment_percentage <= 100),
  bounced_payment_count INTEGER NOT NULL DEFAULT 0 CHECK (bounced_payment_count >= 0),
  completed_projects INTEGER NOT NULL DEFAULT 0 CHECK (completed_projects >= 0),
  late_payment_count INTEGER NOT NULL DEFAULT 0 CHECK (late_payment_count >= 0),
  total_invoices INTEGER NOT NULL DEFAULT 0 CHECK (total_invoices >= 0),
  total_payments INTEGER NOT NULL DEFAULT 0 CHECK (total_payments >= 0),
  business_age_months INTEGER NOT NULL DEFAULT 0 CHECK (business_age_months >= 0),
  gst_verified BOOLEAN NOT NULL DEFAULT false,
  pan_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 3. Create credit_scores table (stores detailed historical runs)
CREATE TABLE IF NOT EXISTS public.credit_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  payment_score INTEGER NOT NULL CHECK (payment_score >= 0 AND payment_score <= 100),
  project_score INTEGER NOT NULL CHECK (project_score >= 0 AND project_score <= 100),
  exposure_score INTEGER NOT NULL CHECK (exposure_score >= 0 AND exposure_score <= 100),
  verification_score INTEGER NOT NULL CHECK (verification_score >= 0 AND verification_score <= 100),
  completion_score INTEGER NOT NULL CHECK (completion_score >= 0 AND completion_score <= 100),
  final_credit_limit NUMERIC(14, 2) NOT NULL CHECK (final_credit_limit >= 0),
  decision VARCHAR(50) NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Create credit_audit_logs table (historical override tracking)
CREATE TABLE IF NOT EXISTS public.credit_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  previous_score INTEGER,
  new_score INTEGER,
  previous_limit NUMERIC(14, 2),
  new_limit NUMERIC(14, 2),
  triggering_event VARCHAR(100) NOT NULL,
  performed_by VARCHAR(150) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 5. Alter projects table to add new credit fields
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS project_value NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (project_value >= 0),
  ADD COLUMN IF NOT EXISTS owner_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS architect_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_stage VARCHAR(50) DEFAULT 'planning',
  ADD COLUMN IF NOT EXISTS credit_allocated NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (credit_allocated >= 0),
  ADD COLUMN IF NOT EXISTS credit_used NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (credit_used >= 0);

-- 6. Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  invoice_amount NUMERIC(14, 2) NOT NULL CHECK (invoice_amount >= 0),
  due_date DATE NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE,
  payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'partially_paid', 'overdue')),
  days_late INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 7. Create payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  payment_method VARCHAR(50),
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reference_number VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Enable RLS for all new tables
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 8. Add RLS Policies

-- Contractors Policies
DROP POLICY IF EXISTS contractors_select ON public.contractors;
CREATE POLICY contractors_select ON public.contractors FOR SELECT TO authenticated
  USING (is_admin_user() OR id = current_profile_id());

DROP POLICY IF EXISTS contractors_all_admin ON public.contractors;
CREATE POLICY contractors_all_admin ON public.contractors FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- Credit Profiles Policies
DROP POLICY IF EXISTS credit_profiles_select ON public.credit_profiles;
CREATE POLICY credit_profiles_select ON public.credit_profiles FOR SELECT TO authenticated
  USING (is_admin_user() OR contractor_id = current_profile_id());

DROP POLICY IF EXISTS credit_profiles_all_admin ON public.credit_profiles;
CREATE POLICY credit_profiles_all_admin ON public.credit_profiles FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- Credit Scores Policies (Admins only see full historical breakdowns)
DROP POLICY IF EXISTS credit_scores_select ON public.credit_scores;
CREATE POLICY credit_scores_select ON public.credit_scores FOR SELECT TO authenticated
  USING (is_admin_user());

DROP POLICY IF EXISTS credit_scores_all_admin ON public.credit_scores;
CREATE POLICY credit_scores_all_admin ON public.credit_scores FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- Credit Audit Logs Policies
DROP POLICY IF EXISTS credit_audit_logs_select ON public.credit_audit_logs;
CREATE POLICY credit_audit_logs_select ON public.credit_audit_logs FOR SELECT TO authenticated
  USING (is_admin_user() OR contractor_id = current_profile_id());

DROP POLICY IF EXISTS credit_audit_logs_all_admin ON public.credit_audit_logs;
CREATE POLICY credit_audit_logs_all_admin ON public.credit_audit_logs FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- Invoices Policies
DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
  USING (is_admin_user() OR contractor_id = current_profile_id());

DROP POLICY IF EXISTS invoices_all_admin ON public.invoices;
CREATE POLICY invoices_all_admin ON public.invoices FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- Payments Policies
DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
  USING (is_admin_user() OR EXISTS (
    SELECT 1 FROM public.invoices i 
    WHERE i.id = payments.invoice_id AND i.contractor_id = current_profile_id()
  ));

DROP POLICY IF EXISTS payments_all_admin ON public.payments;
CREATE POLICY payments_all_admin ON public.payments FOR ALL TO authenticated
  USING (is_admin_user()) WITH CHECK (is_admin_user());

-- 9. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contractors_risk_score ON public.contractors (risk_score);
CREATE INDEX IF NOT EXISTS idx_credit_profiles_contractor ON public.credit_profiles (contractor_id);
CREATE INDEX IF NOT EXISTS idx_credit_scores_contractor ON public.credit_scores (contractor_id);
CREATE INDEX IF NOT EXISTS idx_credit_audit_logs_contractor ON public.credit_audit_logs (contractor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contractor ON public.invoices (contractor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices (payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments (invoice_id);

-- 10. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contractors_updated_at ON public.contractors;
CREATE TRIGGER trg_contractors_updated_at BEFORE UPDATE ON public.contractors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_credit_profiles_updated_at ON public.credit_profiles;
CREATE TRIGGER trg_credit_profiles_updated_at BEFORE UPDATE ON public.credit_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 11. Seed some contractors, profiles, invoices, payments if needed for testing (Only if they don't exist)
-- Let's fetch some existing users who could be contractors and link them
DO $$
DECLARE
  v_user_record RECORD;
BEGIN
  FOR v_user_record IN 
    SELECT id, gst_number FROM public.users 
    WHERE role = 'customer'::public.user_role OR role = 'electrician'::public.user_role
  LOOP
    INSERT INTO public.contractors(id, credit_limit, available_credit, risk_score, credit_status, credit_version)
    VALUES (v_user_record.id, 500000.00, 500000.00, 75, 'yellow', 1)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.credit_profiles(
      contractor_id, annual_purchase_volume, active_project_value, outstanding_amount, 
      average_payment_delay_days, on_time_payment_percentage, bounced_payment_count, 
      completed_projects, late_payment_count, total_invoices, total_payments, 
      business_age_months, gst_verified, pan_verified
    )
    VALUES (
      v_user_record.id, 1200000.00, 800000.00, 0.00, 
      2.50, 95.00, 0, 
      3, 1, 10, 9, 
      24, (v_user_record.gst_number IS NOT NULL), true
    )
    ON CONFLICT (contractor_id) DO NOTHING;
  END LOOP;
END;
$$;
