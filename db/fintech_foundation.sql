BEGIN;

CREATE TYPE public.wallet_account_status AS ENUM ('active', 'frozen', 'closed');
CREATE TYPE public.wallet_entry_direction AS ENUM ('credit', 'debit');
CREATE TYPE public.wallet_entry_type AS ENUM (
  'manual_adjustment',
  'referral_reward',
  'cashback_reward',
  'savings_bonus',
  'savings_contribution',
  'wallet_redemption',
  'finance_disbursement',
  'finance_repayment',
  'reversal'
);
CREATE TYPE public.wallet_entry_status AS ENUM ('pending', 'posted', 'reversed', 'cancelled');
CREATE TYPE public.savings_plan_status AS ENUM ('draft', 'active', 'paused', 'retired');
CREATE TYPE public.savings_subscription_status AS ENUM ('active', 'paused', 'completed', 'defaulted', 'cancelled');
CREATE TYPE public.installment_status AS ENUM ('pending', 'paid', 'late', 'waived', 'cancelled');
CREATE TYPE public.referral_program_status AS ENUM ('draft', 'active', 'paused', 'retired');
CREATE TYPE public.referral_reward_status AS ENUM ('pending', 'approved', 'credited', 'rejected', 'reversed');

CREATE TABLE public.wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR',
  status public.wallet_account_status NOT NULL DEFAULT 'active',
  available_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  lifetime_credited NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (lifetime_credited >= 0),
  lifetime_debited NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (lifetime_debited >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

CREATE TRIGGER trg_wallet_accounts_updated_at
BEFORE UPDATE ON public.wallet_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.wallet_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wallet_account_id UUID NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
  direction public.wallet_entry_direction NOT NULL,
  entry_type public.wallet_entry_type NOT NULL,
  status public.wallet_entry_status NOT NULL DEFAULT 'posted',
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency_code VARCHAR(10) NOT NULL DEFAULT 'INR',
  reference_type VARCHAR(80),
  reference_id UUID,
  external_reference VARCHAR(120),
  narrative TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_ledger_entries_wallet_account_id ON public.wallet_ledger_entries(wallet_account_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_entries_tenant_id ON public.wallet_ledger_entries(tenant_id, created_at DESC);

CREATE TABLE public.wallet_balance_snapshots (
  wallet_account_id UUID PRIMARY KEY REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  last_ledger_entry_id UUID REFERENCES public.wallet_ledger_entries(id) ON DELETE SET NULL,
  available_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.savings_plan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  installment_amount NUMERIC(14,2) NOT NULL CHECK (installment_amount > 0),
  installment_count INTEGER NOT NULL CHECK (installment_count BETWEEN 1 AND 24),
  frequency_days INTEGER NOT NULL DEFAULT 30 CHECK (frequency_days > 0),
  maturity_bonus_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (maturity_bonus_amount >= 0),
  minimum_completion_ratio NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (minimum_completion_ratio > 0 AND minimum_completion_ratio <= 100),
  status public.savings_plan_status NOT NULL DEFAULT 'draft',
  eligibility_rules JSONB,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TRIGGER trg_savings_plan_templates_updated_at
BEFORE UPDATE ON public.savings_plan_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.savings_plan_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  wallet_account_id UUID NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_template_id UUID NOT NULL REFERENCES public.savings_plan_templates(id) ON DELETE RESTRICT,
  subscription_number VARCHAR(50) NOT NULL,
  status public.savings_subscription_status NOT NULL DEFAULT 'active',
  started_at DATE NOT NULL DEFAULT CURRENT_DATE,
  maturity_date DATE,
  installment_amount NUMERIC(14,2) NOT NULL CHECK (installment_amount > 0),
  installment_count INTEGER NOT NULL CHECK (installment_count > 0),
  maturity_bonus_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (maturity_bonus_amount >= 0),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, subscription_number)
);

CREATE TRIGGER trg_savings_plan_subscriptions_updated_at
BEFORE UPDATE ON public.savings_plan_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.savings_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.savings_plan_subscriptions(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  due_date DATE NOT NULL,
  expected_amount NUMERIC(14,2) NOT NULL CHECK (expected_amount > 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status public.installment_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  wallet_ledger_entry_id UUID REFERENCES public.wallet_ledger_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, installment_number)
);

CREATE TRIGGER trg_savings_installments_updated_at
BEFORE UPDATE ON public.savings_installments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.referral_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  status public.referral_program_status NOT NULL DEFAULT 'draft',
  trigger_event VARCHAR(80) NOT NULL,
  reward_amount NUMERIC(14,2) NOT NULL CHECK (reward_amount >= 0),
  referrer_reward_amount NUMERIC(14,2) NOT NULL CHECK (referrer_reward_amount >= 0),
  referred_reward_amount NUMERIC(14,2) NOT NULL CHECK (referred_reward_amount >= 0),
  max_rewards_per_referrer INTEGER,
  eligibility_rules JSONB,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TRIGGER trg_referral_programs_updated_at
BEFORE UPDATE ON public.referral_programs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, user_id)
);

CREATE TABLE public.referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  referral_program_id UUID REFERENCES public.referral_programs(id) ON DELETE SET NULL,
  referral_code_id UUID REFERENCES public.referral_codes(id) ON DELETE SET NULL,
  referrer_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referred_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  trigger_event VARCHAR(80) NOT NULL,
  reference_type VARCHAR(80),
  reference_id UUID,
  event_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referral_events_tenant_id ON public.referral_events(tenant_id, created_at DESC);

CREATE TABLE public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  referral_event_id UUID NOT NULL REFERENCES public.referral_events(id) ON DELETE CASCADE,
  beneficiary_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  wallet_account_id UUID REFERENCES public.wallet_accounts(id) ON DELETE SET NULL,
  reward_status public.referral_reward_status NOT NULL DEFAULT 'pending',
  reward_amount NUMERIC(14,2) NOT NULL CHECK (reward_amount >= 0),
  wallet_ledger_entry_id UUID REFERENCES public.wallet_ledger_entries(id) ON DELETE SET NULL,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_referral_rewards_updated_at
BEFORE UPDATE ON public.referral_rewards
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_plan_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_accounts_select ON public.wallet_accounts
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR user_id = public.current_profile_id()
  )
);

CREATE POLICY wallet_accounts_write ON public.wallet_accounts
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY wallet_ledger_select ON public.wallet_ledger_entries
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND EXISTS (
    SELECT 1
    FROM public.wallet_accounts wa
    WHERE wa.id = wallet_ledger_entries.wallet_account_id
      AND (
        public.can_administer_tenant(wa.tenant_id)
        OR wa.user_id = public.current_profile_id()
      )
  )
);

CREATE POLICY wallet_ledger_write ON public.wallet_ledger_entries
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY wallet_balance_select ON public.wallet_balance_snapshots
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND EXISTS (
    SELECT 1
    FROM public.wallet_accounts wa
    WHERE wa.id = wallet_balance_snapshots.wallet_account_id
      AND (
        public.can_administer_tenant(wa.tenant_id)
        OR wa.user_id = public.current_profile_id()
      )
  )
);

CREATE POLICY wallet_balance_write ON public.wallet_balance_snapshots
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY savings_templates_select ON public.savings_plan_templates
FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));

CREATE POLICY savings_templates_write ON public.savings_plan_templates
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY savings_subscriptions_select ON public.savings_plan_subscriptions
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR user_id = public.current_profile_id()
  )
);

CREATE POLICY savings_subscriptions_write ON public.savings_plan_subscriptions
FOR ALL TO authenticated
USING (
  public.can_administer_tenant(tenant_id)
  OR user_id = public.current_profile_id()
)
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR user_id = public.current_profile_id()
  )
);

CREATE POLICY savings_installments_select ON public.savings_installments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.savings_plan_subscriptions sps
    WHERE sps.id = savings_installments.subscription_id
      AND public.can_access_tenant(sps.tenant_id)
      AND (
        public.can_administer_tenant(sps.tenant_id)
        OR sps.user_id = public.current_profile_id()
      )
  )
);

CREATE POLICY savings_installments_write ON public.savings_installments
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.savings_plan_subscriptions sps
    WHERE sps.id = savings_installments.subscription_id
      AND public.can_administer_tenant(sps.tenant_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.savings_plan_subscriptions sps
    WHERE sps.id = savings_installments.subscription_id
      AND public.can_administer_tenant(sps.tenant_id)
  )
);

CREATE POLICY referral_programs_select ON public.referral_programs
FOR SELECT TO authenticated
USING (public.can_access_tenant(tenant_id));

CREATE POLICY referral_programs_write ON public.referral_programs
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY referral_codes_select ON public.referral_codes
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR user_id = public.current_profile_id()
  )
);

CREATE POLICY referral_codes_write ON public.referral_codes
FOR ALL TO authenticated
USING (
  public.can_administer_tenant(tenant_id)
  OR user_id = public.current_profile_id()
)
WITH CHECK (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR user_id = public.current_profile_id()
  )
);

CREATE POLICY referral_events_select ON public.referral_events
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR referrer_user_id = public.current_profile_id()
    OR referred_user_id = public.current_profile_id()
  )
);

CREATE POLICY referral_events_write ON public.referral_events
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE POLICY referral_rewards_select ON public.referral_rewards
FOR SELECT TO authenticated
USING (
  public.can_access_tenant(tenant_id)
  AND (
    public.can_administer_tenant(tenant_id)
    OR beneficiary_user_id = public.current_profile_id()
  )
);

CREATE POLICY referral_rewards_write ON public.referral_rewards
FOR ALL TO authenticated
USING (public.can_administer_tenant(tenant_id))
WITH CHECK (public.can_administer_tenant(tenant_id));

CREATE OR REPLACE FUNCTION public.ensure_wallet_account(target_tenant_id UUID, target_user_id UUID)
RETURNS public.wallet_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_row public.wallet_accounts;
BEGIN
  IF NOT (
    public.can_administer_tenant(target_tenant_id)
    OR (
      public.can_access_tenant(target_tenant_id)
      AND target_user_id = public.current_profile_id()
    )
  ) THEN
    RAISE EXCEPTION 'You do not have access to create or view this wallet.';
  END IF;

  INSERT INTO public.wallet_accounts (tenant_id, user_id)
  VALUES (target_tenant_id, target_user_id)
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  SELECT *
  INTO result_row
  FROM public.wallet_accounts
  WHERE tenant_id = target_tenant_id
    AND user_id = target_user_id;

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_wallet_entry(
  target_tenant_id UUID,
  target_wallet_account_id UUID,
  target_direction public.wallet_entry_direction,
  target_entry_type public.wallet_entry_type,
  target_amount NUMERIC,
  target_narrative TEXT DEFAULT NULL,
  target_reference_type VARCHAR DEFAULT NULL,
  target_reference_id UUID DEFAULT NULL,
  target_external_reference VARCHAR DEFAULT NULL
)
RETURNS public.wallet_ledger_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet_row public.wallet_accounts;
  ledger_row public.wallet_ledger_entries;
  next_available_balance NUMERIC(14,2);
BEGIN
  IF NOT public.can_administer_tenant(target_tenant_id) THEN
    RAISE EXCEPTION 'Only tenant admins can post wallet entries directly.';
  END IF;

  IF COALESCE(target_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Wallet entry amount must be greater than zero.';
  END IF;

  SELECT *
  INTO wallet_row
  FROM public.wallet_accounts
  WHERE id = target_wallet_account_id
    AND tenant_id = target_tenant_id
  FOR UPDATE;

  IF wallet_row.id IS NULL THEN
    RAISE EXCEPTION 'Wallet account not found for this tenant.';
  END IF;

  next_available_balance := wallet_row.available_balance
    + CASE WHEN target_direction = 'credit' THEN target_amount ELSE -target_amount END;

  IF next_available_balance < 0 THEN
    RAISE EXCEPTION 'Wallet debit would make the balance negative.';
  END IF;

  INSERT INTO public.wallet_ledger_entries (
    tenant_id,
    wallet_account_id,
    direction,
    entry_type,
    status,
    amount,
    currency_code,
    reference_type,
    reference_id,
    external_reference,
    narrative,
    created_by
  )
  VALUES (
    target_tenant_id,
    target_wallet_account_id,
    target_direction,
    target_entry_type,
    'posted',
    target_amount,
    wallet_row.currency_code,
    target_reference_type,
    target_reference_id,
    target_external_reference,
    target_narrative,
    public.current_profile_id()
  )
  RETURNING *
  INTO ledger_row;

  UPDATE public.wallet_accounts
  SET
    available_balance = next_available_balance,
    lifetime_credited = lifetime_credited + CASE WHEN target_direction = 'credit' THEN target_amount ELSE 0 END,
    lifetime_debited = lifetime_debited + CASE WHEN target_direction = 'debit' THEN target_amount ELSE 0 END,
    updated_at = NOW()
  WHERE id = target_wallet_account_id;

  INSERT INTO public.wallet_balance_snapshots (
    wallet_account_id,
    tenant_id,
    last_ledger_entry_id,
    available_balance,
    calculated_at
  )
  VALUES (
    target_wallet_account_id,
    target_tenant_id,
    ledger_row.id,
    next_available_balance,
    NOW()
  )
  ON CONFLICT (wallet_account_id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
    available_balance = EXCLUDED.available_balance,
    calculated_at = EXCLUDED.calculated_at;

  RETURN ledger_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_savings_installment(
  target_installment_id UUID,
  payment_amount NUMERIC DEFAULT NULL,
  note_text TEXT DEFAULT NULL
)
RETURNS public.savings_installments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  installment_row public.savings_installments;
  subscription_row public.savings_plan_subscriptions;
  wallet_row public.wallet_accounts;
  contribution_entry public.wallet_ledger_entries;
  completion_bonus_entry public.wallet_ledger_entries;
  remaining_amount NUMERIC(14,2);
  final_payment_amount NUMERIC(14,2);
  should_complete_subscription BOOLEAN;
BEGIN
  SELECT *
  INTO installment_row
  FROM public.savings_installments
  WHERE id = target_installment_id
  FOR UPDATE;

  IF installment_row.id IS NULL THEN
    RAISE EXCEPTION 'Installment not found.';
  END IF;

  SELECT *
  INTO subscription_row
  FROM public.savings_plan_subscriptions
  WHERE id = installment_row.subscription_id
  FOR UPDATE;

  IF subscription_row.id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found for installment.';
  END IF;

  IF NOT (
    public.can_administer_tenant(subscription_row.tenant_id)
    OR subscription_row.user_id = public.current_profile_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to pay this installment.';
  END IF;

  IF installment_row.status NOT IN ('pending', 'late') THEN
    RAISE EXCEPTION 'Only pending or late installments can be paid.';
  END IF;

  IF subscription_row.status NOT IN ('active', 'paused') THEN
    RAISE EXCEPTION 'Only active or paused subscriptions can receive payments.';
  END IF;

  remaining_amount := installment_row.expected_amount - installment_row.paid_amount;

  IF remaining_amount <= 0 THEN
    RAISE EXCEPTION 'This installment is already fully paid.';
  END IF;

  final_payment_amount := COALESCE(payment_amount, remaining_amount);

  IF final_payment_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  IF final_payment_amount > remaining_amount THEN
    RAISE EXCEPTION 'Payment amount cannot exceed the remaining installment value.';
  END IF;

  SELECT *
  INTO wallet_row
  FROM public.wallet_accounts
  WHERE id = subscription_row.wallet_account_id
  FOR UPDATE;

  IF wallet_row.id IS NULL THEN
    RAISE EXCEPTION 'Wallet account not found for subscription.';
  END IF;

  INSERT INTO public.wallet_ledger_entries (
    tenant_id,
    wallet_account_id,
    direction,
    entry_type,
    status,
    amount,
    currency_code,
    reference_type,
    reference_id,
    narrative,
    created_by
  )
  VALUES (
    subscription_row.tenant_id,
    wallet_row.id,
    'credit',
    'savings_contribution',
    'posted',
    final_payment_amount,
    wallet_row.currency_code,
    'savings_installment',
    installment_row.id,
    COALESCE(note_text, format('Savings installment %s contribution', installment_row.installment_number)),
    public.current_profile_id()
  )
  RETURNING *
  INTO contribution_entry;

  UPDATE public.wallet_accounts
  SET
    available_balance = available_balance + final_payment_amount,
    lifetime_credited = lifetime_credited + final_payment_amount,
    updated_at = NOW()
  WHERE id = wallet_row.id;

  INSERT INTO public.wallet_balance_snapshots (
    wallet_account_id,
    tenant_id,
    last_ledger_entry_id,
    available_balance,
    calculated_at
  )
  VALUES (
    wallet_row.id,
    subscription_row.tenant_id,
    contribution_entry.id,
    wallet_row.available_balance + final_payment_amount,
    NOW()
  )
  ON CONFLICT (wallet_account_id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
    available_balance = EXCLUDED.available_balance,
    calculated_at = EXCLUDED.calculated_at;

  UPDATE public.savings_installments
  SET
    paid_amount = paid_amount + final_payment_amount,
    paid_at = CASE
      WHEN paid_amount + final_payment_amount >= expected_amount THEN NOW()
      ELSE paid_at
    END,
    status = CASE
      WHEN paid_amount + final_payment_amount >= expected_amount THEN 'paid'
      ELSE status
    END,
    wallet_ledger_entry_id = contribution_entry.id,
    updated_at = NOW()
  WHERE id = installment_row.id
  RETURNING *
  INTO installment_row;

  should_complete_subscription := NOT EXISTS (
    SELECT 1
    FROM public.savings_installments si
    WHERE si.subscription_id = subscription_row.id
      AND si.status NOT IN ('paid', 'waived', 'cancelled')
  );

  IF should_complete_subscription THEN
    UPDATE public.savings_plan_subscriptions
    SET
      status = 'completed',
      completed_at = COALESCE(completed_at, NOW()),
      updated_at = NOW()
    WHERE id = subscription_row.id;

    IF subscription_row.maturity_bonus_amount > 0
       AND NOT EXISTS (
         SELECT 1
         FROM public.wallet_ledger_entries wle
         WHERE wle.reference_type = 'savings_subscription_bonus'
           AND wle.reference_id = subscription_row.id
           AND wle.entry_type = 'savings_bonus'
       )
    THEN
      INSERT INTO public.wallet_ledger_entries (
        tenant_id,
        wallet_account_id,
        direction,
        entry_type,
        status,
        amount,
        currency_code,
        reference_type,
        reference_id,
        narrative,
        created_by
      )
      VALUES (
        subscription_row.tenant_id,
        wallet_row.id,
        'credit',
        'savings_bonus',
        'posted',
        subscription_row.maturity_bonus_amount,
        wallet_row.currency_code,
        'savings_subscription_bonus',
        subscription_row.id,
        format('Maturity bonus for subscription %s', subscription_row.subscription_number),
        public.current_profile_id()
      )
      RETURNING *
      INTO completion_bonus_entry;

      UPDATE public.wallet_accounts
      SET
        available_balance = available_balance + subscription_row.maturity_bonus_amount,
        lifetime_credited = lifetime_credited + subscription_row.maturity_bonus_amount,
        updated_at = NOW()
      WHERE id = wallet_row.id;

      UPDATE public.wallet_balance_snapshots
      SET
        last_ledger_entry_id = completion_bonus_entry.id,
        available_balance = available_balance + subscription_row.maturity_bonus_amount,
        calculated_at = NOW()
      WHERE wallet_account_id = wallet_row.id;
    END IF;
  END IF;

  RETURN installment_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_referral_reward(
  target_reward_id UUID,
  approve_reward BOOLEAN DEFAULT TRUE,
  note_text TEXT DEFAULT NULL
)
RETURNS public.referral_rewards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reward_row public.referral_rewards;
  event_row public.referral_events;
  wallet_row public.wallet_accounts;
  reward_entry public.wallet_ledger_entries;
BEGIN
  SELECT *
  INTO reward_row
  FROM public.referral_rewards
  WHERE id = target_reward_id
  FOR UPDATE;

  IF reward_row.id IS NULL THEN
    RAISE EXCEPTION 'Referral reward not found.';
  END IF;

  IF NOT public.can_administer_tenant(reward_row.tenant_id) THEN
    RAISE EXCEPTION 'Only tenant admins can resolve referral rewards.';
  END IF;

  IF reward_row.reward_status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Only pending or approved rewards can be resolved.';
  END IF;

  IF NOT approve_reward THEN
    UPDATE public.referral_rewards
    SET
      reward_status = 'rejected',
      decision_notes = note_text,
      updated_at = NOW()
    WHERE id = reward_row.id
    RETURNING *
    INTO reward_row;

    RETURN reward_row;
  END IF;

  SELECT *
  INTO event_row
  FROM public.referral_events
  WHERE id = reward_row.referral_event_id;

  wallet_row := public.ensure_wallet_account(reward_row.tenant_id, reward_row.beneficiary_user_id);

  IF reward_row.reward_amount > 0 THEN
    INSERT INTO public.wallet_ledger_entries (
      tenant_id,
      wallet_account_id,
      direction,
      entry_type,
      status,
      amount,
      currency_code,
      reference_type,
      reference_id,
      narrative,
      created_by
    )
    VALUES (
      reward_row.tenant_id,
      wallet_row.id,
      'credit',
      'referral_reward',
      'posted',
      reward_row.reward_amount,
      wallet_row.currency_code,
      'referral_reward',
      reward_row.id,
      COALESCE(note_text, format('Referral reward for event %s', COALESCE(event_row.trigger_event, reward_row.referral_event_id::text))),
      public.current_profile_id()
    )
    RETURNING *
    INTO reward_entry;

    UPDATE public.wallet_accounts
    SET
      available_balance = available_balance + reward_row.reward_amount,
      lifetime_credited = lifetime_credited + reward_row.reward_amount,
      updated_at = NOW()
    WHERE id = wallet_row.id;

    INSERT INTO public.wallet_balance_snapshots (
      wallet_account_id,
      tenant_id,
      last_ledger_entry_id,
      available_balance,
      calculated_at
    )
    VALUES (
      wallet_row.id,
      reward_row.tenant_id,
      reward_entry.id,
      wallet_row.available_balance + reward_row.reward_amount,
      NOW()
    )
    ON CONFLICT (wallet_account_id) DO UPDATE
    SET
      tenant_id = EXCLUDED.tenant_id,
      last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
      available_balance = EXCLUDED.available_balance,
      calculated_at = EXCLUDED.calculated_at;
  END IF;

  UPDATE public.referral_rewards
  SET
    wallet_account_id = wallet_row.id,
    wallet_ledger_entry_id = reward_entry.id,
    reward_status = CASE WHEN reward_row.reward_amount > 0 THEN 'credited' ELSE 'approved' END,
    decision_notes = note_text,
    updated_at = NOW()
  WHERE id = reward_row.id
  RETURNING *
  INTO reward_row;

  RETURN reward_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_wallet_account(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_wallet_entry(UUID, UUID, public.wallet_entry_direction, public.wallet_entry_type, NUMERIC, TEXT, VARCHAR, UUID, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_savings_installment(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_referral_reward(UUID, BOOLEAN, TEXT) TO authenticated;

COMMIT;
