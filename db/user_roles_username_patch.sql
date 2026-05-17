BEGIN;

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
      WHERE lower(username) = lower(candidate)
        AND (current_user_id IS NULL OR id <> current_user_id)
    );

    suffix := suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

UPDATE public.users
SET username = public.make_unique_username(
  COALESCE(
    NULLIF(username, ''),
    NULLIF(split_part(lower(email), '@', 1), ''),
    NULLIF(public.normalize_username(full_name), ''),
    NULLIF(regexp_replace(coalesce(phone, ''), '[^0-9]+', '', 'g'), ''),
    'user'
  ),
  id
)
WHERE username IS NULL
   OR trim(username) = ''
   OR username <> public.normalize_username(username);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key
  ON public.users (lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON public.users (lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_normalized_key
  ON public.users (public.normalize_phone(phone))
  WHERE phone IS NOT NULL AND trim(phone) <> '';

ALTER TABLE public.users
  ALTER COLUMN username SET NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
  safe_role public.user_role;
  matched_user_id UUID;
  target_tenant_id UUID;
  requested_username TEXT;
  safe_username TEXT;
  membership_role_type TEXT;
BEGIN
  requested_role := LOWER(COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer'));
  requested_username := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'username', ''),
    NULLIF(split_part(lower(COALESCE(NEW.email, '')), '@', 1), ''),
    NULLIF(public.normalize_username(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]+', '', 'g'), ''),
    'user'
  );
  safe_username := NULLIF(public.normalize_username(requested_username), '');

  IF safe_username IS NULL THEN
    safe_username := 'user';
  END IF;

  IF length(safe_username) < 3 THEN
    safe_username := rpad(safe_username, 3, 'x');
  END IF;

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

  SELECT c.udt_name
  INTO membership_role_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'tenant_memberships'
    AND c.column_name = 'role'
  LIMIT 1;

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
      (NEW.email IS NOT NULL AND email IS NOT NULL AND LOWER(email) = LOWER(NEW.email))
      OR
      (NEW.phone IS NOT NULL AND phone IS NOT NULL AND phone = NEW.phone)
    )
  ORDER BY created_at
  LIMIT 1;

  IF matched_user_id IS NOT NULL THEN
    UPDATE public.users
    SET
      auth_user_id = NEW.id,
      default_tenant_id = COALESCE(default_tenant_id, target_tenant_id),
      username = COALESCE(NULLIF(username, ''), safe_username),
      email = COALESCE(NULLIF(NEW.email, ''), email),
      phone = COALESCE(NULLIF(NEW.phone, ''), phone),
      full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name, 'User'),
      role = COALESCE(role, safe_role),
      last_login_at = NEW.last_sign_in_at,
      updated_at = NOW()
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
      NULLIF(NEW.phone, ''),
      NULLIF(NEW.email, ''),
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
    EXECUTE format(
      'INSERT INTO public.tenant_memberships (
         tenant_id,
         user_id,
         role,
         is_default,
         is_active
       )
       VALUES ($1, $2, $3::public.%I, TRUE, TRUE)
       ON CONFLICT (tenant_id, user_id) DO UPDATE
       SET
         role = EXCLUDED.role,
         is_default = TRUE,
         is_active = TRUE,
         updated_at = NOW()',
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

COMMIT;
