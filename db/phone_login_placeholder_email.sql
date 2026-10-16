-- Phone-login placeholder emails stay off profiles
-- Phone-only accounts get an internal address (<digits>@phone.mahalaxmi-electricals.app) so
-- the API can issue them a Supabase session. The auth -> profile sync trigger copied it onto
-- public.users on every sign-in; it now ignores those addresses. Never emailed.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_auth_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  visible_email TEXT := CASE
    WHEN NEW.email ILIKE '%@phone.mahalaxmi-electricals.app' THEN NULL
    ELSE NULLIF(NEW.email, '')
  END;
BEGIN
  UPDATE public.users
  SET email = COALESCE(visible_email, email),
      phone = COALESCE(NULLIF(NEW.phone, ''), phone),
      full_name = COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), full_name),
      last_login_at = NEW.last_sign_in_at,
      updated_at = NOW()
  WHERE auth_user_id = NEW.id;
  RETURN NEW;
END;
$function$;

UPDATE public.users
SET email = NULL, updated_at = NOW()
WHERE email ILIKE '%@phone.mahalaxmi-electricals.app';

COMMIT;
