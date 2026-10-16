-- Sign-ups always create customers
-- Additive SQL migration. public.handle_new_auth_user previously honoured a role sent in
-- the sign-up metadata, so anyone calling Supabase directly could sign up as an electrician
-- or architect. Every new account is now a customer; admins promote people from
-- Admin > Users & Verification. Only the role assignment changed; the rest of the function
-- (username, workspace membership, referral rewards) is as it was.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  requested_role text;
  safe_role public.user_role;
  matched_user_id uuid;
  target_tenant_id uuid;
  safe_username text;
  membership_role_type text;
BEGIN
  requested_role := lower(coalesce(NEW.raw_user_meta_data ->> 'role', 'customer'));
  
  safe_username := public.make_unique_username(
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
      NULLIF(split_part(lower(coalesce(NEW.email, '')), '@', 1), ''),
      NULLIF(public.normalize_username(NEW.raw_user_meta_data ->> 'full_name'), ''),
      NULLIF(public.normalize_phone(NEW.phone), ''),
      'user'
    )
  );

  -- Everyone who signs up is a customer; admins promote accounts to electrician or
  -- architect afterwards. A role sent with the sign-up request is ignored.
  safe_role := 'customer'::public.user_role;

  SELECT id
  INTO target_tenant_id
  FROM public.tenants
  WHERE slug = 'mahalaxmi-electricals'
  LIMIT 1;

  SELECT id
  INTO matched_user_id
  FROM public.users
  WHERE auth_user_id IS NULL
    AND (
      (NEW.email IS NOT NULL AND email IS NOT NULL AND lower(email) = lower(NEW.email))
      OR
      (NEW.phone IS NOT NULL AND phone IS NOT NULL AND public.normalize_phone(phone) = public.normalize_phone(NEW.phone))
    )
  ORDER BY created_at
  LIMIT 1;

  IF matched_user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      default_tenant_id = COALESCE(default_tenant_id, target_tenant_id),
      username = COALESCE(NULLIF(username, ''), safe_username),
      email = COALESCE(NULLIF(lower(NEW.email), ''), email),
      phone = COALESCE(NULLIF(public.normalize_phone(NEW.phone), ''), phone),
      full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name, 'User'),
      role = COALESCE(role, safe_role),
      last_login_at = NEW.last_sign_in_at,
      updated_at = now()
    WHERE id = matched_user_id;
  ELSE
    INSERT INTO public.users (
      auth_user_id,
      default_tenant_id,
      username,
      role,
      full_name,
      phone,
      email,
      status,
      verification_status,
      is_admin_verified,
      last_login_at
    )
    VALUES (
      NEW.id,
      target_tenant_id,
      safe_username,
      safe_role,
      COALESCE(
        NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
        split_part(COALESCE(NULLIF(NEW.email, ''), NULLIF(NEW.phone, ''), 'user'), '@', 1),
        'User'
      ),
      NULLIF(public.normalize_phone(NEW.phone), ''),
      NULLIF(lower(NEW.email), ''),
      'active',
      CASE
        WHEN safe_role = 'customer' THEN 'verified'::public.verification_status
        ELSE 'pending'::public.verification_status
      END,
      CASE
        WHEN safe_role = 'customer' THEN TRUE
        ELSE FALSE
      END,
      NEW.last_sign_in_at
    )
    ON CONFLICT (auth_user_id) DO NOTHING;

    SELECT id
    INTO matched_user_id
    FROM public.users
    WHERE auth_user_id = NEW.id
    LIMIT 1;
  END IF;

  IF matched_user_id IS NOT NULL AND target_tenant_id IS NOT NULL THEN
    SELECT c.udt_name
    INTO membership_role_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'tenant_memberships'
      AND c.column_name = 'role'
    LIMIT 1;

    EXECUTE format(
      'INSERT INTO public.tenant_memberships (
         tenant_id, user_id, role, is_default, is_active
       )
       VALUES ($1, $2, $3::public.%I, TRUE, TRUE)
       ON CONFLICT (tenant_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, is_default = TRUE, is_active = TRUE, updated_at = now()',
      COALESCE(membership_role_type, 'user_role')
    )
    USING target_tenant_id, matched_user_id, safe_role::text;
  END IF;

  -- Process referral if provided in raw_user_meta_data
  IF matched_user_id IS NOT NULL AND target_tenant_id IS NOT NULL THEN
    DECLARE
      ref_code_text text;
      ref_code_row record;
      ref_program_row record;
      ref_event_id uuid;
      ref_reward_id uuid;
      ref_referrer_wallet record;
      ref_ledger_id uuid;
      ref_next_balance numeric(14,2);
    BEGIN
      ref_code_text := NEW.raw_user_meta_data ->> 'referral_code';
      IF ref_code_text IS NOT NULL AND ref_code_text <> '' THEN
        -- Find active referral code
        SELECT * INTO ref_code_row
        FROM public.referral_codes
        WHERE tenant_id = target_tenant_id
          AND lower(code) = lower(trim(ref_code_text))
          AND is_active = true
        LIMIT 1;

        -- Make sure code is found and is not referring self
        IF ref_code_row.id IS NOT NULL AND ref_code_row.user_id <> matched_user_id THEN
          -- Find active referral program for signup
          SELECT * INTO ref_program_row
          FROM public.referral_programs
          WHERE tenant_id = target_tenant_id
            AND trigger_event = 'signup'
            AND status = 'active'
          LIMIT 1;

          -- Create referral event
          ref_event_id := gen_random_uuid();
          INSERT INTO public.referral_events (
            id, tenant_id, referral_program_id, referral_code_id,
            referrer_user_id, referred_user_id, trigger_event,
            created_at
          )
          VALUES (
            ref_event_id, target_tenant_id, ref_program_row.id, ref_code_row.id,
            ref_code_row.user_id, matched_user_id, 'signup',
            now()
          );

          -- Create referral reward for referrer
          ref_reward_id := gen_random_uuid();
          INSERT INTO public.referral_rewards (
            id, tenant_id, referral_event_id, beneficiary_user_id,
            reward_amount, reward_status, created_at
          )
          VALUES (
            ref_reward_id, target_tenant_id, ref_event_id, ref_code_row.user_id,
            COALESCE(ref_program_row.referrer_reward_amount, 100.00), 'credited', now()
          );

          -- Ensure referrer has a wallet
          ref_referrer_wallet := public.ensure_wallet_account(target_tenant_id, ref_code_row.user_id);

          -- Credit points/amount to referrer's wallet
          IF ref_referrer_wallet.id IS NOT NULL THEN
            ref_ledger_id := gen_random_uuid();
            INSERT INTO public.wallet_ledger_entries (
              id, tenant_id, wallet_account_id, direction, entry_type,
              status, amount, currency_code, reference_type, reference_id,
              narrative, created_at
            )
            VALUES (
              ref_ledger_id, target_tenant_id, ref_referrer_wallet.id, 'credit', 'referral_reward',
              'posted', COALESCE(ref_program_row.referrer_reward_amount, 100.00), ref_referrer_wallet.currency_code,
              'referral_reward', ref_reward_id, 'Referral signup reward credited.', now()
            );

            -- Update balance snapshots to avoid drift
            ref_next_balance := COALESCE(ref_referrer_wallet.available_balance, 0.00) + COALESCE(ref_program_row.referrer_reward_amount, 100.00);
            INSERT INTO public.wallet_balance_snapshots (
              wallet_account_id,
              tenant_id,
              last_ledger_entry_id,
              available_balance,
              calculated_at
            )
            VALUES (
              ref_referrer_wallet.id,
              target_tenant_id,
              ref_ledger_id,
              ref_next_balance,
              now()
            )
            ON CONFLICT (wallet_account_id) DO UPDATE
            SET
              last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
              available_balance = EXCLUDED.available_balance,
              calculated_at = EXCLUDED.calculated_at;
          END IF;

          -- Create referral reward for referred user (if program has referred_reward_amount > 0)
          IF ref_program_row.id IS NOT NULL AND COALESCE(ref_program_row.referred_reward_amount, 0.00) > 0.00 THEN
            DECLARE
              ref_referred_reward_id uuid;
              ref_referred_wallet record;
              ref_referred_ledger_id uuid;
              ref_referred_next_balance numeric(14,2);
            BEGIN
              ref_referred_reward_id := gen_random_uuid();
              INSERT INTO public.referral_rewards (
                id, tenant_id, referral_event_id, beneficiary_user_id,
                reward_amount, reward_status, created_at
              )
              VALUES (
                ref_referred_reward_id, target_tenant_id, ref_event_id, matched_user_id,
                ref_program_row.referred_reward_amount, 'credited', now()
              );

              -- Ensure referred user has a wallet
              ref_referred_wallet := public.ensure_wallet_account(target_tenant_id, matched_user_id);

              IF ref_referred_wallet.id IS NOT NULL THEN
                ref_referred_ledger_id := gen_random_uuid();
                INSERT INTO public.wallet_ledger_entries (
                  id, tenant_id, wallet_account_id, direction, entry_type,
                  status, amount, currency_code, reference_type, reference_id,
                  narrative, created_at
                )
                VALUES (
                  ref_referred_ledger_id, target_tenant_id, ref_referred_wallet.id, 'credit', 'referral_reward',
                  'posted', ref_program_row.referred_reward_amount, ref_referred_wallet.currency_code,
                  'referral_reward', ref_referred_reward_id, 'Referral signup welcome reward credited.', now()
                );

                ref_referred_next_balance := COALESCE(ref_referred_wallet.available_balance, 0.00) + ref_program_row.referred_reward_amount;
                INSERT INTO public.wallet_balance_snapshots (
                  wallet_account_id,
                  tenant_id,
                  last_ledger_entry_id,
                  available_balance,
                  calculated_at
                )
                VALUES (
                  ref_referred_wallet.id,
                  target_tenant_id,
                  ref_referred_ledger_id,
                  ref_referred_next_balance,
                  now()
                )
                ON CONFLICT (wallet_account_id) DO UPDATE
                SET
                  last_ledger_entry_id = EXCLUDED.last_ledger_entry_id,
                  available_balance = EXCLUDED.available_balance,
                  calculated_at = EXCLUDED.calculated_at;
              END IF;
            END;
          END IF;
        END IF;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
