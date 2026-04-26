BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
  safe_role public.user_role;
  safe_membership_role public.tenant_membership_role;
  matched_user_id UUID;
  target_tenant_id UUID;
BEGIN
  requested_role := LOWER(COALESCE(NEW.raw_user_meta_data ->> 'role', 'customer'));

  safe_role := CASE
    WHEN requested_role = 'electrician' THEN 'electrician'::public.user_role
    WHEN requested_role = 'architect' THEN 'architect'::public.user_role
    ELSE 'customer'::public.user_role
  END;

  safe_membership_role := CASE
    WHEN safe_role = 'electrician' THEN 'electrician'::public.tenant_membership_role
    WHEN safe_role = 'architect' THEN 'architect'::public.tenant_membership_role
    ELSE 'customer'::public.tenant_membership_role
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
    INSERT INTO public.tenant_memberships (
      tenant_id,
      user_id,
      role,
      is_default,
      is_active
    )
    VALUES (
      target_tenant_id,
      matched_user_id,
      safe_membership_role,
      TRUE,
      TRUE
    )
    ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET
      role = EXCLUDED.role,
      is_default = TRUE,
      is_active = TRUE,
      updated_at = NOW();
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
