-- =====================================================================
-- UNIFIED DATABASE WORKFLOWS, AUTH, AND CONSTRAINTS REPAIR PATCH
-- =====================================================================
-- Run this script in the Supabase SQL Editor to clean up duplicate records,
-- establish proper unique constraints, set up robust usernames, and repair
-- the signup trigger alongside all multi-role construction workflows.

BEGIN;

-- 1. EXTEND USER ROLES AND TENANT MEMBERSHIP ROLES
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'supplier';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'pop_man';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'carpenter';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'painter';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'tiles_man';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'plumber';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_membership_role') THEN
    EXECUTE 'ALTER TYPE public.tenant_membership_role ADD VALUE IF NOT EXISTS ''supplier''';
    EXECUTE 'ALTER TYPE public.tenant_membership_role ADD VALUE IF NOT EXISTS ''pop_man''';
    EXECUTE 'ALTER TYPE public.tenant_membership_role ADD VALUE IF NOT EXISTS ''carpenter''';
    EXECUTE 'ALTER TYPE public.tenant_membership_role ADD VALUE IF NOT EXISTS ''painter''';
    EXECUTE 'ALTER TYPE public.tenant_membership_role ADD VALUE IF NOT EXISTS ''tiles_man''';
    EXECUTE 'ALTER TYPE public.tenant_membership_role ADD VALUE IF NOT EXISTS ''plumber''';
  END IF;
END $$;

-- 2. DEDUPLICATE RECORDS IN USERS & TENANT MEMBERSHIPS
-- Ensure we can safely create unique constraints on the DB.
DELETE FROM public.users a
USING public.users b
WHERE a.ctid < b.ctid
  AND a.auth_user_id IS NOT NULL
  AND a.auth_user_id = b.auth_user_id;

DELETE FROM public.tenant_memberships a
USING public.tenant_memberships b
WHERE a.ctid < b.ctid
  AND a.tenant_id = b.tenant_id
  AND a.user_id = b.user_id;

-- 3. ENFORCE UNIQUE CONSTRAINTS REQUIRED BY THE SIGNUP TRIGGER
-- Without these constraints, the ON CONFLICT clauses inside the handle_new_auth_user() function will fail.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_auth_user_id_key;

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);

ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_tenant_id_user_id_key;

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_tenant_id_user_id_key UNIQUE (tenant_id, user_id);

-- 4. USERNAME SUPPORT AND NORMALIZATION FUNCTIONS
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username character varying(24);

CREATE OR REPLACE FUNCTION public.normalize_username(raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT left(
    regexp_replace(lower(coalesce(raw_value, '')), '[^a-z0-9._]+', '', 'g'),
    24
  )
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(coalesce(raw_value, ''), '[^0-9+]+', '', 'g')
$$;

CREATE OR REPLACE FUNCTION public.make_unique_username(base_username text, current_user_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  sanitized_base text;
  candidate text;
  suffix integer := 0;
BEGIN
  sanitized_base := NULLIF(public.normalize_username(base_username), '');

  IF sanitized_base IS NULL THEN
    sanitized_base := 'user';
  END IF;

  IF length(sanitized_base) < 3 THEN
    sanitized_base := rpad(sanitized_base, 3, 'x');
  END IF;

  LOOP
    candidate := CASE
      WHEN suffix = 0 THEN sanitized_base
      ELSE left(sanitized_base, greatest(1, 24 - length(suffix::text) - 1)) || '_' || suffix::text
    END;

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.users
      WHERE lower(coalesce(username, '')) = lower(candidate)
        AND (current_user_id IS NULL OR id <> current_user_id)
    );

    suffix := suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

-- 5. BACKFILL MISSING USERNAMES & ENFORCE CONSTRAINTS
UPDATE public.users
SET username = public.make_unique_username(
  COALESCE(
    NULLIF(username, ''),
    NULLIF(split_part(lower(email), '@', 1), ''),
    NULLIF(public.normalize_username(full_name), ''),
    NULLIF(public.normalize_phone(phone), ''),
    'user'
  ),
  id
)
WHERE username IS NULL
   OR trim(username) = ''
   OR username <> public.normalize_username(username);

ALTER TABLE public.users
  ALTER COLUMN username SET NOT NULL;

DROP INDEX IF EXISTS public.users_username_lower_key;
CREATE UNIQUE INDEX users_username_lower_key
  ON public.users (lower(username));

DROP INDEX IF EXISTS public.users_email_lower_key;
CREATE UNIQUE INDEX users_email_lower_key
  ON public.users (lower(email))
  WHERE email IS NOT NULL;

DROP INDEX IF EXISTS public.users_phone_normalized_key;
CREATE UNIQUE INDEX users_phone_normalized_key
  ON public.users (public.normalize_phone(phone))
  WHERE phone IS NOT NULL AND trim(phone) <> '';

-- 6. PUBLIC USERS IDENTITY UNIQUENESS TRIGGER
CREATE OR REPLACE FUNCTION public.enforce_public_user_identity_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  normalized_username text;
  normalized_email text;
  normalized_phone text;
BEGIN
  normalized_username := NULLIF(public.normalize_username(NEW.username), '');
  normalized_email := NULLIF(lower(trim(coalesce(NEW.email, ''))), '');
  normalized_phone := NULLIF(public.normalize_phone(NEW.phone), '');

  IF normalized_username IS NULL THEN
    RAISE EXCEPTION 'Username is required';
  END IF;

  NEW.username := normalized_username;
  NEW.email := normalized_email;
  NEW.phone := normalized_phone;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(username) = normalized_username
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Username already exists';
  END IF;

  IF normalized_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = normalized_email
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Email already exists';
  END IF;

  IF normalized_phone IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.users
    WHERE public.normalize_phone(phone) = normalized_phone
      AND id <> COALESCE(NEW.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'Phone already exists';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_identity_uniqueness ON public.users;
CREATE TRIGGER trg_users_identity_uniqueness
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_public_user_identity_uniqueness();

-- 7. REPAIR THE AUTH SIGNUP TRIGGER (SYNC WITH AUTH.USERS)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  safe_role := CASE
    WHEN requested_role = 'electrician' THEN 'electrician'::public.user_role
    WHEN requested_role = 'architect' THEN 'architect'::public.user_role
    WHEN requested_role = 'supplier' THEN 'supplier'::public.user_role
    WHEN requested_role = 'pop_man' THEN 'pop_man'::public.user_role
    WHEN requested_role = 'carpenter' THEN 'carpenter'::public.user_role
    WHEN requested_role = 'painter' THEN 'painter'::public.user_role
    WHEN requested_role = 'tiles_man' THEN 'tiles_man'::public.user_role
    WHEN requested_role = 'plumber' THEN 'plumber'::public.user_role
    ELSE 'customer'::public.user_role
  END;

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user();

-- 8. AUTOMATED SITE CODE SEQUENCING UX POLISH
CREATE SEQUENCE IF NOT EXISTS public.site_code_seq START 1000;

CREATE OR REPLACE FUNCTION public.set_default_site_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.site_code IS NULL OR NEW.site_code = '' THEN
    NEW.site_code := 'SIT-' || nextval('public.site_code_seq')::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_default_site_code ON public.sites;
CREATE TRIGGER trigger_set_default_site_code
BEFORE INSERT ON public.sites
FOR EACH ROW
EXECUTE FUNCTION public.set_default_site_code();

-- 9. REPAIR SUPPLIER / ADMIN ORDER ITEM SUPPLY RPC
CREATE OR REPLACE FUNCTION public.mark_order_item_supplied(
  target_order_item_id UUID,
  supplied_qty NUMERIC,
  note_text TEXT DEFAULT NULL
)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_required NUMERIC;
  current_supplied NUMERIC;
  new_total NUMERIC;
  next_status public.order_item_status;
  item_product_id UUID;
BEGIN
  IF NOT public.is_admin_user() AND public.current_profile_role() != 'supplier'::public.user_role THEN
    RAISE EXCEPTION 'Only admin or supplier can mark supply';
  END IF;

  SELECT quantity_required, quantity_supplied, product_id
  INTO current_required, current_supplied, item_product_id
  FROM public.order_items
  WHERE id = target_order_item_id;

  new_total := COALESCE(current_supplied, 0) + COALESCE(supplied_qty, 0);
  next_status := CASE WHEN new_total >= current_required THEN 'supplied' ELSE 'partially_supplied' END;
  
  UPDATE public.order_items
  SET quantity_supplied = LEAST(new_total, current_required),
      supplied_by = public.current_profile_id(),
      supplied_at = NOW(),
      admin_notes = COALESCE(note_text, admin_notes),
      shop_confirmed_by = COALESCE(shop_confirmed_by, public.current_profile_id()),
      shop_confirmed_at = COALESCE(shop_confirmed_at, NOW())
  WHERE id = target_order_item_id;

  -- Deduct from inventory
  UPDATE public.product_inventory
  SET available_qty = GREATEST(available_qty - COALESCE(supplied_qty, 0), 0),
      reserved_qty = GREATEST(reserved_qty - COALESCE(supplied_qty, 0), 0)
  WHERE product_id = item_product_id;

  RETURN public.record_order_item_status(target_order_item_id, next_status, note_text);
END;
$$;

-- 10. GET PROFILE POLICIES AND RPC
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(profile_row)
  FROM (
    SELECT
      id,
      auth_user_id,
      full_name,
      email,
      phone,
      role,
      city,
      state,
      company_name,
      verification_status,
      is_admin_verified
    FROM public.users
    WHERE auth_user_id = auth.uid() OR id = auth.uid()
    ORDER BY CASE WHEN auth_user_id = auth.uid() THEN 0 ELSE 1 END
    LIMIT 1
  ) AS profile_row
$$;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

DROP POLICY IF EXISTS users_select_self_or_verified_directory ON public.users;
CREATE POLICY users_select_self_or_verified_directory ON public.users
FOR SELECT TO authenticated
USING (
  auth.uid() = auth_user_id
  OR id = public.current_profile_id()
  OR public.is_admin_user()
  OR (
    role IN ('electrician', 'architect')
    AND status = 'active'
    AND verification_status = 'verified'
    AND is_admin_verified = TRUE
  )
);

COMMIT;
