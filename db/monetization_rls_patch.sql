-- RLS Patch for B2B Procurement Monetization and Payment-Risk Control
BEGIN;

-- Enable Row Level Security
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_credit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escrow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_guarantees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repayment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_fee_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS ledger_accounts_select_policy ON public.ledger_accounts;
DROP POLICY IF EXISTS ledger_accounts_admin_all ON public.ledger_accounts;
DROP POLICY IF EXISTS ledger_transactions_select ON public.ledger_transactions;
DROP POLICY IF EXISTS ledger_entries_select ON public.ledger_entries;
DROP POLICY IF EXISTS risk_profiles_select ON public.contractor_risk_profiles;
DROP POLICY IF EXISTS credit_requests_select ON public.credit_requests;
DROP POLICY IF EXISTS credit_requests_insert ON public.credit_requests;
DROP POLICY IF EXISTS escrow_accounts_select ON public.escrow_accounts;

-- 1. Ledger Accounts Policies
CREATE POLICY ledger_accounts_select_policy ON public.ledger_accounts
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR user_id = public.current_profile_id()
  )
);

CREATE POLICY ledger_accounts_admin_all ON public.ledger_accounts
FOR ALL TO authenticated
USING (public.is_admin_user());

-- 2. Ledger Entries & Transactions Policies
CREATE POLICY ledger_transactions_select ON public.ledger_transactions
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.ledger_entries le
      JOIN public.ledger_accounts la ON la.id = le.account_id
      WHERE le.transaction_id = ledger_transactions.id
        AND la.user_id = public.current_profile_id()
    )
  )
);

CREATE POLICY ledger_entries_select ON public.ledger_entries
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.ledger_accounts la
      WHERE la.id = ledger_entries.account_id
        AND la.user_id = public.current_profile_id()
    )
  )
);

-- 3. Contractor Risk Profile Policies
CREATE POLICY risk_profiles_select ON public.contractor_risk_profiles
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR user_id = public.current_profile_id()
  )
);

-- 4. Credit Requests Policies
CREATE POLICY credit_requests_select ON public.credit_requests
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR contractor_id = public.current_profile_id()
  )
);

CREATE POLICY credit_requests_insert ON public.credit_requests
FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND contractor_id = public.current_profile_id()
);

-- 5. Escrow Account Policies
CREATE POLICY escrow_accounts_select ON public.escrow_accounts
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.is_admin_user()
    OR customer_id = public.current_profile_id()
    OR EXISTS (
      SELECT 1 FROM public.site_orders so
      WHERE so.id = escrow_accounts.site_order_id
        AND (so.electrician_id = public.current_profile_id() OR so.architect_id = public.current_profile_id())
    )
  )
);

COMMIT;
