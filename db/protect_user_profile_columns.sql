-- SECURITY: stop people editing their own privileged profile fields.
--
-- Why: signed-in users (the `authenticated` database role) can UPDATE every column of
-- public.users on their own row (policy users_update_self_or_admin + a table-wide UPDATE
-- grant), and the only trigger on role just caps admins at 4. With the public anon key and
-- their own login, anyone could therefore run
--     update users set role = 'admin' / credit_limit = 100000 / verification_status = 'verified'
-- on themselves. The API/app never needs that: roles, verification and credit are changed by
-- shop admins, and name / username / city / state / company are saved by the API with the
-- service role. Email and mobile number are changed only through the verified flows
-- (confirmation link / texted code), which also run as the service role or via Supabase Auth.
--
-- After this runs, a person logged in as `authenticated` (non-admin) can still change:
-- full_name, username, company_name, gst_number, address_*, city, state, postal_code,
-- country, profile_photo_url, default_tenant_id. Admins and server code can change anything.
--
-- Apply in the Supabase SQL editor. Undo with:
--   drop trigger trg_users_protect_privileged on public.users;
--   drop function public.protect_user_privileged_columns();

CREATE OR REPLACE FUNCTION public.protect_user_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- Server code (service role), SECURITY DEFINER sync triggers, the SQL editor and other
  -- trusted database roles run as something other than these two and may change anything.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Shop admins manage roles, verification and credit.
  IF public.is_admin_user() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.is_admin_verified IS DISTINCT FROM OLD.is_admin_verified
     OR NEW.credit_limit IS DISTINCT FROM OLD.credit_limit
     OR NEW.credit_balance IS DISTINCT FROM OLD.credit_balance
     OR NEW.credit_score IS DISTINCT FROM OLD.credit_score
     OR NEW.password_hash IS DISTINCT FROM OLD.password_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.notes IS DISTINCT FROM OLD.notes
  THEN
    RAISE EXCEPTION 'You cannot change that detail yourself.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_users_protect_privileged ON public.users;
CREATE TRIGGER trg_users_protect_privileged
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.protect_user_privileged_columns();
