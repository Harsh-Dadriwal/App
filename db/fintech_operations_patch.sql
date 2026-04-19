BEGIN;

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
  bonus_entry public.wallet_ledger_entries;
  remaining_amount NUMERIC(14,2);
  final_payment_amount NUMERIC(14,2);
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

  IF NOT (
    public.can_administer_tenant(subscription_row.tenant_id)
    OR subscription_row.user_id = public.current_profile_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to pay this installment.';
  END IF;

  IF installment_row.status NOT IN ('pending', 'late') THEN
    RAISE EXCEPTION 'Only pending or late installments can be paid.';
  END IF;

  remaining_amount := installment_row.expected_amount - installment_row.paid_amount;
  final_payment_amount := COALESCE(payment_amount, remaining_amount);

  IF final_payment_amount <= 0 OR final_payment_amount > remaining_amount THEN
    RAISE EXCEPTION 'Invalid installment payment amount.';
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
    paid_at = CASE WHEN paid_amount + final_payment_amount >= expected_amount THEN NOW() ELSE paid_at END,
    status = CASE WHEN paid_amount + final_payment_amount >= expected_amount THEN 'paid' ELSE status END,
    wallet_ledger_entry_id = contribution_entry.id,
    updated_at = NOW()
  WHERE id = installment_row.id
  RETURNING *
  INTO installment_row;

  IF NOT EXISTS (
    SELECT 1
    FROM public.savings_installments si
    WHERE si.subscription_id = subscription_row.id
      AND si.status NOT IN ('paid', 'waived', 'cancelled')
  ) THEN
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
      INTO bonus_entry;

      UPDATE public.wallet_accounts
      SET
        available_balance = available_balance + subscription_row.maturity_bonus_amount,
        lifetime_credited = lifetime_credited + subscription_row.maturity_bonus_amount,
        updated_at = NOW()
      WHERE id = wallet_row.id;

      UPDATE public.wallet_balance_snapshots
      SET
        last_ledger_entry_id = bonus_entry.id,
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
    SET reward_status = 'rejected', decision_notes = note_text, updated_at = NOW()
    WHERE id = reward_row.id
    RETURNING *
    INTO reward_row;

    RETURN reward_row;
  END IF;

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
      COALESCE(note_text, 'Referral reward approved and credited.'),
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
