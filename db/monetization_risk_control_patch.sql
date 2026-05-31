-- Additive migration for B2B Procurement Monetization and Payment-Risk Control
BEGIN;

-- ==========================================
-- TYPES AND ENUMS (If not already defined)
-- ==========================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_account_type') THEN
        CREATE TYPE public.ledger_account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_direction') THEN
        CREATE TYPE public.ledger_entry_direction AS ENUM ('DEBIT', 'CREDIT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'risk_band_type') THEN
        CREATE TYPE public.risk_band_type AS ENUM ('LOW', 'MODERATE', 'HIGH', 'BLOCKED');
    END IF;
END
$$;

-- ==========================================
-- 0. Core Ledger Infrastructure Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  account_number VARCHAR(60) NOT NULL,
  name VARCHAR(150) NOT NULL,
  type public.ledger_account_type NOT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR',
  balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, account_number),
  UNIQUE (tenant_id, user_id, account_number)
);

CREATE TABLE IF NOT EXISTS public.ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  reference_type VARCHAR(60) NOT NULL, -- 'WALLET_DEPOSIT', 'ESCROW_LOCK', 'ESCROW_RELEASE', 'CREDIT_DISBURSEMENT', 'PROCUREMENT_FEE', 'REPAYMENT', 'PENALTY', 'SAVINGS_SHARE'
  reference_id UUID NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES public.ledger_transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT,
  direction public.ledger_entry_direction NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 1. Risk and Credit Profiling Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.contractor_risk_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  trust_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (trust_score BETWEEN 0 AND 100),
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (credit_limit >= 0),
  outstanding_credit NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (outstanding_credit >= 0),
  payment_history_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (payment_history_score BETWEEN 0 AND 100),
  repayment_consistency NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (repayment_consistency BETWEEN 0 AND 100),
  dispute_count INTEGER NOT NULL DEFAULT 0 CHECK (dispute_count >= 0),
  project_completion_score NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (project_completion_score BETWEEN 0 AND 100),
  risk_band public.risk_band_type NOT NULL DEFAULT 'BLOCKED',
  default_probability NUMERIC(5,4) NOT NULL DEFAULT 1.0000 CHECK (default_probability BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.credit_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  allocated_limit NUMERIC(14,2) NOT NULL CHECK (allocated_limit >= 0),
  available_limit NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (available_limit >= 0),
  utilized_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (utilized_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_allocated_vs_utilized CHECK (utilized_amount <= allocated_limit)
);

CREATE TABLE IF NOT EXISTS public.site_credit_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL UNIQUE REFERENCES public.sites(id) ON DELETE CASCADE,
  site_budget NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (site_budget >= 0),
  approved_limit NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (approved_limit >= 0),
  utilization NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (utilization >= 0),
  repayment_status VARCHAR(30) NOT NULL DEFAULT 'CURRENT', -- 'CURRENT', 'DELINQUENT', 'DEFAULT'
  architect_verification public.verification_status NOT NULL DEFAULT 'pending',
  customer_backing public.verification_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_site_utilized_amount CHECK (utilization <= approved_limit)
);

CREATE TABLE IF NOT EXISTS public.credit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0),
  purpose TEXT,
  status public.finance_application_status NOT NULL DEFAULT 'draft',
  approved_amount NUMERIC(14,2) CHECK (approved_amount >= 0),
  advance_required_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (advance_required_percentage BETWEEN 0 AND 100),
  reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. Escrow Architecture Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.escrow_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  site_order_id UUID NOT NULL REFERENCES public.site_orders(id) ON DELETE CASCADE,
  total_escrow_amount NUMERIC(14,2) NOT NULL CHECK (total_escrow_amount >= 0),
  locked_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (locked_amount >= 0),
  released_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (released_amount >= 0),
  disputed_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (disputed_amount >= 0),
  status public.finance_application_status NOT NULL DEFAULT 'draft', -- using finance_application_status mapping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_escrow_totals CHECK (locked_amount + released_amount + disputed_amount <= total_escrow_amount)
);

CREATE TABLE IF NOT EXISTS public.escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  escrow_account_id UUID NOT NULL REFERENCES public.escrow_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  type VARCHAR(30) NOT NULL, -- 'LOCK', 'RELEASE', 'DISPUTE_HOLD', 'DISPUTE_RELEASE', 'REFUND'
  ledger_tx_id UUID REFERENCES public.ledger_transactions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. Risk Mitigation & Guarantees Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.payment_guarantees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  guarantor_type VARCHAR(30) NOT NULL, -- 'CUSTOMER_DIRECT', 'THIRD_PARTY_SPONSOR', 'BANK_LCI'
  guarantee_amount NUMERIC(14,2) NOT NULL CHECK (guarantee_amount > 0),
  document_url TEXT,
  status public.verification_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.repayment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  contractor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_order_id UUID REFERENCES public.site_orders(id) ON DELETE SET NULL,
  total_due NUMERIC(14,2) NOT NULL CHECK (total_due >= 0),
  principal_due NUMERIC(14,2) NOT NULL CHECK (principal_due >= 0),
  interest_due NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (interest_due >= 0),
  penalty_due NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (penalty_due >= 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (amount_paid >= 0),
  due_date DATE NOT NULL,
  status public.installment_status NOT NULL DEFAULT 'pending', -- pending, paid, late, waived, cancelled
  paid_at TIMESTAMPTZ,
  grace_period_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_paid_limit CHECK (amount_paid <= total_due)
);

-- ==========================================
-- 4. Monetization & Subscription Tables
-- ==========================================

CREATE TABLE IF NOT EXISTS public.procurement_fee_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_order_id UUID NOT NULL REFERENCES public.site_orders(id) ON DELETE CASCADE,
  fee_model VARCHAR(30) NOT NULL, -- 'FIXED', 'PERCENTAGE', 'SAVINGS_SHARE', 'ESCROW_SETTLEMENT'
  calculated_fee NUMERIC(14,2) NOT NULL CHECK (calculated_fee >= 0),
  waived_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (waived_amount >= 0),
  final_fee NUMERIC(14,2) NOT NULL CHECK (final_fee >= 0),
  payment_status public.installment_status NOT NULL DEFAULT 'pending',
  ledger_tx_id UUID REFERENCES public.ledger_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.urgency_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  urgency_level VARCHAR(20) NOT NULL CHECK (urgency_level IN ('STANDARD', 'PRIORITY', 'EMERGENCY')),
  fee_type VARCHAR(20) NOT NULL CHECK (fee_type IN ('FIXED', 'PERCENTAGE')),
  fee_value NUMERIC(14,2) NOT NULL CHECK (fee_value >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, urgency_level)
);

CREATE TABLE IF NOT EXISTS public.supplier_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL, -- 'FREE', 'PREMIUM', 'ELITE'
  name VARCHAR(100) NOT NULL,
  price NUMERIC(14,2) NOT NULL CHECK (price >= 0),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.contractor_subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL, -- 'FREE', 'PRO', 'ENTERPRISE'
  name VARCHAR(100) NOT NULL,
  price NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

-- ==========================================
-- Triggers for auto updated_at columns
-- ==========================================
CREATE TRIGGER trg_ledger_accounts_updated_at BEFORE UPDATE ON public.ledger_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_contractor_risk_profiles_updated_at BEFORE UPDATE ON public.contractor_risk_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_credit_limits_updated_at BEFORE UPDATE ON public.credit_limits FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_site_credit_profiles_updated_at BEFORE UPDATE ON public.site_credit_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_credit_requests_updated_at BEFORE UPDATE ON public.credit_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_escrow_accounts_updated_at BEFORE UPDATE ON public.escrow_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payment_guarantees_updated_at BEFORE UPDATE ON public.payment_guarantees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_repayment_schedules_updated_at BEFORE UPDATE ON public.repayment_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_procurement_fee_entries_updated_at BEFORE UPDATE ON public.procurement_fee_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_urgency_pricing_updated_at BEFORE UPDATE ON public.urgency_pricing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_supplier_subscription_plans_updated_at BEFORE UPDATE ON public.supplier_subscription_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_contractor_subscription_plans_updated_at BEFORE UPDATE ON public.contractor_subscription_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ==========================================
-- Indices for Query Performance
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_user ON public.ledger_accounts(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_tx ON public.ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON public.ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_risk_profiles_user ON public.contractor_risk_profiles(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_order ON public.escrow_accounts(site_order_id);
CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON public.credit_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_repayment_schedules_due ON public.repayment_schedules(tenant_id, due_date, status);

COMMIT;
