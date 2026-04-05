BEGIN;

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
