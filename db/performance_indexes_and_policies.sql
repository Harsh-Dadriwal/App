-- Performance: foreign-key indexes + cheaper row-level-security policies.
-- Based on the Supabase performance advisor (2026-11-09). Safe to run more than once.
--
-- 1. Indexes on foreign-key columns of this app's tables. Without them, every join or
--    lookup by those columns (orders by partner, quotations by selection, notes by
--    recipient, ...) and every delete on the parent table scans the whole child table.
-- 2. The same access rules as before, with auth.uid() wrapped as (select auth.uid()) so
--    Postgres evaluates it once per query instead of once per row. Nothing is loosened.
--
-- Apply in the Supabase SQL editor. Roll back with DROP INDEX / re-running the old policies.

DO $$
DECLARE
  fk record;
  idx_name text;
  col_list text;
BEGIN
  FOR fk IN
    SELECT c.oid AS con_oid, c.conrelid, c.conkey, c.conrelid::regclass::text AS tbl
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND c.conrelid::regclass::text IN (
        'order_requests','partner_commission_ledger','partner_points_wallet','partner_reward_redemptions',
        'project_media','project_rooms','project_task_assignees','project_tasks','projects','quotations',
        'requirement_batch_items','requirement_batch_processing_jobs','requirement_batch_review_actions',
        'requirement_batch_sources','savings_installments','savings_plan_subscriptions','site_assignments',
        'site_credit_profiles','site_notes','site_orders','sites','substitute_suggestions','tally_stock_items',
        'tally_sync_logs','user_professional_profiles','wallet_accounts','wallet_balance_snapshots',
        'workflow_logs','invoices','partner_business_summary','partner_incentive_schemes',
        'partner_scheme_history','partner_slab_history'
      )
      -- skip foreign keys that already have an index starting with the same columns
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid AND i.indisvalid
          AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      )
  LOOP
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord),
           string_agg(a.attname, '_' ORDER BY u.ord)
      INTO col_list, idx_name
    FROM unnest(fk.conkey) WITH ORDINALITY u(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = fk.conrelid AND a.attnum = u.attnum;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %s (%s)',
      left('idx_' || fk.tbl || '_' || idx_name, 63), fk.conrelid::regclass, col_list
    );
  END LOOP;
END $$;

-- bids has two identical unique indexes; keep the named constraint, drop the extra copy.
-- (Left commented: dropping an index that backs a constraint must be checked by hand.)
-- ALTER TABLE public.bids DROP CONSTRAINT IF EXISTS uq_task_handyman_bid;

-- ---- RLS: evaluate auth.uid() once per query ----------------------------------------

ALTER POLICY users_select_self_or_verified_directory ON public.users
  USING (
    ((select auth.uid()) = auth_user_id)
    OR (id = current_profile_id())
    OR is_admin_user()
    OR ((role = ANY (ARRAY['electrician'::user_role, 'architect'::user_role]))
        AND (status = 'active'::user_status)
        AND (verification_status = 'verified'::verification_status)
        AND (is_admin_verified = true))
  );

ALTER POLICY lighting_products_select_accessible ON public.lighting_products
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_user_id = (select auth.uid())
      AND (u.role = 'admin'::user_role OR EXISTS (
        SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id = lighting_products.tenant_id AND tm.user_id = u.id AND tm.is_active = true))
  ));

ALTER POLICY lighting_products_admin_write ON public.lighting_products
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_user_id = (select auth.uid()) AND u.role = 'admin'::user_role
      AND EXISTS (SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id = lighting_products.tenant_id AND tm.user_id = u.id AND tm.is_active = true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_user_id = (select auth.uid()) AND u.role = 'admin'::user_role
      AND EXISTS (SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id = lighting_products.tenant_id AND tm.user_id = u.id AND tm.is_active = true)
  ));

ALTER POLICY leads_select_own_or_admin ON public.leads
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_user_id = (select auth.uid())
      AND EXISTS (SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id = leads.tenant_id AND tm.user_id = u.id AND tm.is_active = true)
      AND (u.role = 'admin'::user_role OR leads.requester_user_id = u.id)
  ));

ALTER POLICY leads_insert_accessible ON public.leads
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_user_id = (select auth.uid())
      AND EXISTS (SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id = leads.tenant_id AND tm.user_id = u.id AND tm.is_active = true)
      AND (leads.requester_user_id IS NULL OR leads.requester_user_id = u.id OR u.role = 'admin'::user_role)
  ));

ALTER POLICY leads_update_admin_only ON public.leads
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_user_id = (select auth.uid()) AND u.role = 'admin'::user_role
      AND EXISTS (SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id = leads.tenant_id AND tm.user_id = u.id AND tm.is_active = true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    WHERE u.auth_user_id = (select auth.uid()) AND u.role = 'admin'::user_role
      AND EXISTS (SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id = leads.tenant_id AND tm.user_id = u.id AND tm.is_active = true)
  ));

-- Same rule as before, only with auth.uid() evaluated once. (It compares the sign-in id to
-- tenant_memberships.user_id / users.id, which are the app's own ids; that comparison is
-- unchanged here and worth a separate review.)
ALTER POLICY "Admins can view tenant form submissions" ON public.tally_form_submissions
  USING (
    (tenant_id IN (
      SELECT tenant_memberships.tenant_id FROM tenant_memberships
      WHERE tenant_memberships.user_id = (select auth.uid())
        AND tenant_memberships.role = ANY (ARRAY['admin'::tenant_membership_role, 'owner'::tenant_membership_role, 'staff'::tenant_membership_role])
    ))
    OR (EXISTS (SELECT 1 FROM users WHERE users.id = (select auth.uid()) AND users.role = 'admin'::user_role))
  );
