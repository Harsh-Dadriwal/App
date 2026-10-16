-- One referral code per person
-- referral_codes already allows one code per user per workspace (unique tenant_id, user_id).
-- This stops people deleting or editing their code to get a new one: they may create
-- their own code once and read it; only workspace admins can change or remove codes.

BEGIN;

DROP POLICY IF EXISTS referral_codes_write ON public.referral_codes;
DROP POLICY IF EXISTS referral_codes_insert ON public.referral_codes;
DROP POLICY IF EXISTS referral_codes_admin_update ON public.referral_codes;
DROP POLICY IF EXISTS referral_codes_admin_delete ON public.referral_codes;

CREATE POLICY referral_codes_insert ON public.referral_codes
  FOR INSERT
  WITH CHECK (can_access_tenant(tenant_id) AND (can_administer_tenant(tenant_id) OR user_id = current_profile_id()));

CREATE POLICY referral_codes_admin_update ON public.referral_codes
  FOR UPDATE
  USING (can_access_tenant(tenant_id) AND can_administer_tenant(tenant_id))
  WITH CHECK (can_access_tenant(tenant_id) AND can_administer_tenant(tenant_id));

CREATE POLICY referral_codes_admin_delete ON public.referral_codes
  FOR DELETE
  USING (can_access_tenant(tenant_id) AND can_administer_tenant(tenant_id));

COMMIT;
