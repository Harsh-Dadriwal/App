-- Migration to optimize RLS policies, index performance, and enable Supabase Realtime for Lighting Products and Leads
BEGIN;

-- 1. Create composite indexes to speed up frontend queries
-- Index for lighting_products SELECT: WHERE tenant_id = ? AND is_active = true ORDER BY brand, product_name
CREATE INDEX IF NOT EXISTS idx_lighting_products_tenant_active_brand_name
ON public.lighting_products(tenant_id, is_active, brand, product_name);

-- Index for leads SELECT: WHERE tenant_id = ? AND module = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_leads_tenant_module_created_at
ON public.leads(tenant_id, module, created_at DESC);


-- 2. Optimize RLS Policies for public.lighting_products
-- Drop existing policies
DROP POLICY IF EXISTS lighting_products_select_accessible ON public.lighting_products;
DROP POLICY IF EXISTS lighting_products_admin_write ON public.lighting_products;

-- Optimized SELECT policy using inline subqueries instead of nested functions
CREATE POLICY lighting_products_select_accessible
ON public.lighting_products
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.role = 'admin'
        OR EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = public.lighting_products.tenant_id
            AND tm.user_id = u.id
            AND tm.is_active = TRUE
        )
      )
  )
);

-- Optimized ALL policy for admin writes
CREATE POLICY lighting_products_admin_write
ON public.lighting_products
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.lighting_products.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.lighting_products.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
  )
);


-- 3. Optimize RLS Policies for public.leads
-- Drop existing policies
DROP POLICY IF EXISTS leads_select_own_or_admin ON public.leads;
DROP POLICY IF EXISTS leads_insert_accessible ON public.leads;
DROP POLICY IF EXISTS leads_update_admin_only ON public.leads;

-- Optimized SELECT policy for leads
CREATE POLICY leads_select_own_or_admin
ON public.leads
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.leads.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
      AND (
        u.role = 'admin'
        OR public.leads.requester_user_id = u.id
      )
  )
);

-- Optimized INSERT policy for leads
CREATE POLICY leads_insert_accessible
ON public.leads
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.leads.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
      AND (
        public.leads.requester_user_id IS NULL
        OR public.leads.requester_user_id = u.id
        OR u.role = 'admin'
      )
  )
);

-- Optimized UPDATE policy for leads
CREATE POLICY leads_update_admin_only
ON public.leads
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.leads.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role = 'admin'
      AND EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = public.leads.tenant_id
          AND tm.user_id = u.id
          AND tm.is_active = TRUE
      )
  )
);


-- 4. Enable Supabase Realtime for Leads and Lighting Products
-- Ensure the publication exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- Add lighting_products to the publication if it's not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'lighting_products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lighting_products;
  END IF;
END
$$;

-- Add leads to the publication if it's not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
END
$$;

COMMIT;
