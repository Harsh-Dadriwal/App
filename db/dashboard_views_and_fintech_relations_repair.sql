-- =====================================================================
-- MASTER REPAIR PATCH: DASHBOARD MONITOR & MULTI-TENANT ENRICHED VIEWS
-- =====================================================================
-- Run this complete script in the Supabase SQL Editor to cleanly
-- establish all multi-tenant tables, backfill tenant details,
-- drop and recreate all dashboard and workflow visibility views,
-- and register all schema cache connections for PostgREST.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. DROP ALL STALE OR PARTIAL VIEWS TO PREVENT COLLISION/MISMATCHES
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_recent_order_workflow_events CASCADE;
DROP VIEW IF EXISTS public.vw_order_workflow_timeline CASCADE;
DROP VIEW IF EXISTS public.vw_stuck_order_workflows CASCADE;
DROP VIEW IF EXISTS public.vw_order_workflow_actor_history CASCADE;

DROP VIEW IF EXISTS public.vw_customer_items_on_approval CASCADE;
DROP VIEW IF EXISTS public.vw_electrician_material_tracker CASCADE;
DROP VIEW IF EXISTS public.vw_architect_material_tracker CASCADE;
DROP VIEW IF EXISTS public.vw_customer_finance_applications CASCADE;
DROP VIEW IF EXISTS public.vw_customer_site_projects CASCADE;
DROP VIEW IF EXISTS public.vw_customer_budget_tracker CASCADE;
DROP VIEW IF EXISTS public.vw_electrician_new_projects CASCADE;
DROP VIEW IF EXISTS public.vw_electrician_projects_assigned_to_others CASCADE;
DROP VIEW IF EXISTS public.vw_electrician_ongoing_projects CASCADE;
DROP VIEW IF EXISTS public.vw_architect_new_projects CASCADE;
DROP VIEW IF EXISTS public.vw_architect_ongoing_projects CASCADE;
DROP VIEW IF EXISTS public.vw_product_requests_enriched CASCADE;
DROP VIEW IF EXISTS public.vw_site_notes_enriched CASCADE;
DROP VIEW IF EXISTS public.vw_site_order_item_enriched CASCADE;

-- ---------------------------------------------------------------------
-- 2. RESTORE MULTI-TENANCY COLUMNS AND ENSURE SCHEMA HYGIENE
-- ---------------------------------------------------------------------
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.site_orders ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.system_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.savings_plan_subscriptions ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.finance_applications ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.product_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.site_notes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.budget_trackers ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- 3. BACKFILL DEFAULT TENANT ID (MAHALAXMI ELECTRICALS)
-- ---------------------------------------------------------------------
UPDATE public.sites 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.site_orders 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.order_items 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.system_events 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.workflow_logs 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.savings_plan_subscriptions 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.finance_applications 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.product_requests 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.site_notes 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

UPDATE public.budget_trackers 
SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'mahalaxmi-electricals' LIMIT 1)
WHERE tenant_id IS NULL;

-- ---------------------------------------------------------------------
-- 4. RECREATE WORKFLOW backbone VIEWS WITH CORRECT SCHEMAS
-- ---------------------------------------------------------------------

-- View 1: Recent Order Workflow Events
CREATE OR REPLACE VIEW public.vw_recent_order_workflow_events
WITH (security_invoker = true)
AS
SELECT
  se.id,
  se.tenant_id,
  se.event_type,
  se.entity_type,
  se.entity_id,
  se.actor_user_id,
  actor.full_name AS actor_name,
  se.correlation_id,
  se.source_module,
  se.payload,
  se.created_at,
  oi.site_order_id,
  so.order_number,
  s.site_name,
  oi.item_name_snapshot
FROM public.system_events se
LEFT JOIN public.users actor
  ON actor.id = se.actor_user_id
LEFT JOIN public.order_items oi
  ON se.entity_type = 'order_item'
 AND oi.id = se.entity_id
LEFT JOIN public.site_orders so
  ON so.id = COALESCE(oi.site_order_id, CASE WHEN se.entity_type = 'site_order' THEN se.entity_id END)
LEFT JOIN public.sites s
  ON s.id = COALESCE(oi.site_id, so.site_id)
WHERE se.entity_type IN ('order_item', 'site_order', 'substitute_suggestion')
ORDER BY se.created_at DESC;

-- View 2: Order Workflow Timeline
CREATE OR REPLACE VIEW public.vw_order_workflow_timeline
WITH (security_invoker = true)
AS
SELECT
  se.id AS event_id,
  se.tenant_id,
  se.entity_type,
  se.entity_id,
  se.event_type,
  se.actor_user_id,
  actor.full_name AS actor_name,
  se.source_module,
  se.payload,
  se.created_at,
  oi.site_order_id,
  so.order_number,
  s.site_name,
  oi.item_name_snapshot,
  wl.workflow_name,
  wl.current_step,
  wl.step_status,
  wl.attempt_number,
  wl.notes
FROM public.system_events se
LEFT JOIN public.workflow_logs wl
  ON wl.event_id = se.id
LEFT JOIN public.users actor
  ON actor.id = se.actor_user_id
LEFT JOIN public.order_items oi
  ON se.entity_type = 'order_item'
 AND oi.id = se.entity_id
LEFT JOIN public.site_orders so
  ON so.id = COALESCE(oi.site_order_id, CASE WHEN se.entity_type = 'site_order' THEN se.entity_id END)
LEFT JOIN public.sites s
  ON s.id = COALESCE(oi.site_id, so.site_id)
WHERE se.entity_type IN ('order_item', 'site_order', 'substitute_suggestion')
ORDER BY se.created_at DESC;

-- View 3: Stuck Order Workflows
CREATE OR REPLACE VIEW public.vw_stuck_order_workflows
WITH (security_invoker = true)
AS
SELECT
  'order_item'::TEXT AS entity_type,
  oi.id AS entity_id,
  oi.tenant_id,
  oi.site_order_id,
  so.order_number,
  s.site_name,
  oi.item_name_snapshot AS entity_label,
  oi.status::TEXT AS current_status,
  oi.updated_at AS last_changed_at,
  EXTRACT(EPOCH FROM (NOW() - oi.updated_at)) / 3600 AS hours_in_state
FROM public.order_items oi
JOIN public.site_orders so
  ON so.id = oi.site_order_id
JOIN public.sites s
  ON s.id = oi.site_id
WHERE oi.status IN (
  'pending_architect_approval',
  'pending_customer_approval',
  'approved_pending_shop_confirmation',
  'approved_pending_supply',
  'partially_supplied',
  'substitute_suggested'
)
  AND oi.updated_at < NOW() - INTERVAL '24 hours'
UNION ALL
SELECT
  'site_order'::TEXT AS entity_type,
  so.id AS entity_id,
  so.tenant_id,
  so.id AS site_order_id,
  so.order_number,
  s.site_name,
  so.order_number AS entity_label,
  so.status::TEXT AS current_status,
  so.updated_at AS last_changed_at,
  EXTRACT(EPOCH FROM (NOW() - so.updated_at)) / 3600 AS hours_in_state
FROM public.site_orders so
JOIN public.sites s
  ON s.id = so.site_id
WHERE so.status IN ('awaiting_approval', 'partially_approved', 'confirmed', 'processing', 'partially_supplied')
  AND so.updated_at < NOW() - INTERVAL '24 hours';

-- View 4: Order Workflow Actor History
CREATE OR REPLACE VIEW public.vw_order_workflow_actor_history
WITH (security_invoker = true)
AS
SELECT
  se.tenant_id,
  se.actor_user_id,
  actor.full_name AS actor_name,
  se.entity_type,
  COUNT(*) AS event_count,
  MAX(se.created_at) AS last_event_at
FROM public.system_events se
LEFT JOIN public.users actor
  ON actor.id = se.actor_user_id
WHERE se.entity_type IN ('order_item', 'site_order', 'substitute_suggestion')
GROUP BY se.tenant_id, se.actor_user_id, actor.full_name, se.entity_type;


-- ---------------------------------------------------------------------
-- 5. RECREATE ALL ENRICHED SYSTEM & TENANCY VIEWS (FROM MULTI-TENANT)
-- ---------------------------------------------------------------------

-- View 5: Enriched Site Order Items
CREATE OR REPLACE VIEW public.vw_site_order_item_enriched
WITH (security_invoker = true)
AS
SELECT
  oi.id AS order_item_id,
  oi.site_order_id,
  oi.site_id,
  s.site_code,
  s.site_name,
  s.customer_id,
  customer.full_name AS customer_name,
  sa_electrician.user_id AS electrician_id,
  electrician.full_name AS electrician_name,
  sa_architect.user_id AS architect_id,
  architect.full_name AS architect_name,
  oi.product_id,
  p.sku AS current_product_sku,
  oi.item_name_snapshot,
  oi.category_name_snapshot,
  oi.brand_name_snapshot,
  oi.sku_snapshot,
  oi.unit_snapshot,
  oi.source,
  oi.source_user_id,
  source_user.full_name AS source_user_name,
  oi.parent_order_item_id,
  oi.approval_mode,
  oi.requires_architect_approval,
  oi.quantity_required,
  oi.quantity_approved,
  oi.quantity_supplied,
  oi.unit_price,
  oi.line_subtotal,
  oi.tax_amount,
  oi.line_total,
  oi.electrician_notes,
  oi.architect_notes,
  oi.customer_notes,
  oi.admin_notes,
  oi.status,
  oi.is_substitute,
  oi.substitute_for_order_item_id,
  oi.substitute_status,
  oi.architect_reviewed_by,
  arch_reviewer.full_name AS architect_reviewed_by_name,
  oi.architect_reviewed_at,
  oi.customer_reviewed_by,
  cust_reviewer.full_name AS customer_reviewed_by_name,
  oi.customer_reviewed_at,
  oi.shop_confirmed_by,
  shop_confirmer.full_name AS shop_confirmed_by_name,
  oi.shop_confirmed_at,
  oi.supplied_by,
  supplier.full_name AS supplied_by_name,
  oi.supplied_at,
  oi.created_at,
  oi.updated_at,
  oi.tenant_id
FROM public.order_items oi
JOIN public.sites s ON s.id = oi.site_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.products p ON p.id = oi.product_id
LEFT JOIN public.users source_user ON source_user.id = oi.source_user_id
LEFT JOIN public.users arch_reviewer ON arch_reviewer.id = oi.architect_reviewed_by
LEFT JOIN public.users cust_reviewer ON cust_reviewer.id = oi.customer_reviewed_by
LEFT JOIN public.users shop_confirmer ON shop_confirmer.id = oi.shop_confirmed_by
LEFT JOIN public.users supplier ON supplier.id = oi.supplied_by
LEFT JOIN public.site_assignments sa_electrician
  ON sa_electrician.site_id = s.id
  AND sa_electrician.role = 'electrician'
  AND sa_electrician.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_electrician.user_id
LEFT JOIN public.site_assignments sa_architect
  ON sa_architect.site_id = s.id
  AND sa_architect.role = 'architect'
  AND sa_architect.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_architect.user_id;

-- View 6: Customer Site Projects
CREATE OR REPLACE VIEW public.vw_customer_site_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.customer_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status AS site_status,
  electrician.id AS electrician_id,
  electrician.full_name AS electrician_name,
  architect.id AS architect_id,
  architect.full_name AS architect_name,
  COUNT(DISTINCT oi.id) AS total_material_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('pending_customer_approval', 'substitute_suggested')) AS items_waiting_customer_action,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('approved_pending_shop_confirmation', 'approved_pending_supply', 'partially_supplied')) AS approved_but_not_fully_supplied_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items,
  s.tenant_id
FROM public.sites s
LEFT JOIN public.site_assignments sa_electrician
  ON sa_electrician.site_id = s.id
  AND sa_electrician.role = 'electrician'
  AND sa_electrician.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_electrician.user_id
LEFT JOIN public.site_assignments sa_architect
  ON sa_architect.site_id = s.id
  AND sa_architect.role = 'architect'
  AND sa_architect.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_architect.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
GROUP BY
  s.tenant_id,
  s.id,
  s.customer_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status,
  electrician.id,
  electrician.full_name,
  architect.id,
  architect.full_name;

-- View 7: Customer Budget Tracker
CREATE OR REPLACE VIEW public.vw_customer_budget_tracker
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.customer_id,
  s.site_code,
  s.site_name,
  COALESCE(bt.initial_budget, s.estimated_budget, 0) AS initial_budget,
  COALESCE(bt.revised_budget, s.estimated_budget, 0) AS revised_budget,
  COALESCE(bt.approved_material_budget, 0) AS approved_material_budget,
  COALESCE(bt.actual_material_spend, s.actual_spend, 0) AS actual_material_spend,
  GREATEST(COALESCE(bt.revised_budget, s.estimated_budget, 0) - COALESCE(bt.actual_material_spend, s.actual_spend, 0), 0) AS remaining_budget,
  s.tenant_id
FROM public.sites s
LEFT JOIN public.budget_trackers bt ON bt.site_id = s.id;

-- View 8: Customer Items Pending Approval
CREATE OR REPLACE VIEW public.vw_customer_items_on_approval
WITH (security_invoker = true)
AS
SELECT *
FROM public.vw_site_order_item_enriched
WHERE status IN ('pending_customer_approval', 'substitute_suggested');

-- View 9: Customer Finance Applications
CREATE OR REPLACE VIEW public.vw_customer_finance_applications
WITH (security_invoker = true)
AS
SELECT
  fa.id,
  fa.customer_id,
  fa.site_id,
  s.site_code,
  s.site_name,
  fa.application_number,
  fa.requested_amount,
  fa.approved_amount,
  fa.tenure_months,
  fa.status,
  fa.remarks,
  fa.submitted_at,
  fa.reviewed_at,
  fa.created_at,
  fa.updated_at,
  fa.tenant_id
FROM public.finance_applications fa
LEFT JOIN public.sites s ON s.id = fa.site_id;

-- View 10: Electrician New Projects
CREATE OR REPLACE VIEW public.vw_electrician_new_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.status,
  s.description,
  s.created_at,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  customer.phone AS customer_phone,
  s.tenant_id
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
WHERE s.status = 'open_for_bidding'
  AND NOT EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = s.id
      AND sa.role = 'electrician'
      AND sa.status = 'active'
  );

-- View 11: Electrician Projects Assigned To Others
CREATE OR REPLACE VIEW public.vw_electrician_projects_assigned_to_others
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.status,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  assigned_electrician.id AS assigned_electrician_id,
  assigned_electrician.full_name AS assigned_electrician_name,
  s.tenant_id
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
JOIN public.site_assignments sa
  ON sa.site_id = s.id
  AND sa.role = 'electrician'
  AND sa.status = 'active'
JOIN public.users assigned_electrician ON assigned_electrician.id = sa.user_id
WHERE s.status IN ('assigned', 'in_progress', 'on_hold')
  AND assigned_electrician.role = 'electrician';

-- View 12: Electrician Ongoing Projects
CREATE OR REPLACE VIEW public.vw_electrician_ongoing_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status AS site_status,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  sa.user_id AS electrician_id,
  electrician.full_name AS electrician_name,
  architect.id AS architect_id,
  architect.full_name AS architect_name,
  COUNT(DISTINCT oi.id) AS total_material_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_architect_approval') AS architect_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_customer_approval') AS customer_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('approved_pending_supply', 'partially_supplied')) AS supply_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items,
  s.tenant_id
FROM public.site_assignments sa
JOIN public.sites s ON s.id = sa.site_id
JOIN public.users electrician ON electrician.id = sa.user_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.site_assignments sa_arch
  ON sa_arch.site_id = s.id
  AND sa_arch.role = 'architect'
  AND sa_arch.status = 'active'
LEFT JOIN public.users architect ON architect.id = sa_arch.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
WHERE sa.role = 'electrician'
  AND sa.status = 'active'
  AND s.status IN ('assigned', 'in_progress', 'on_hold')
GROUP BY
  s.id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status,
  customer.id,
  customer.full_name,
  sa.user_id,
  electrician.full_name,
  architect.id,
  architect.full_name;

-- View 13: Electrician Material Tracker
CREATE OR REPLACE VIEW public.vw_electrician_material_tracker
WITH (security_invoker = true)
AS
SELECT
  v.*,
  CASE WHEN v.status <> 'cancelled' THEN TRUE ELSE FALSE END AS in_master_requirement_list,
  CASE WHEN v.status = 'supplied' THEN TRUE ELSE FALSE END AS in_material_already_on_site,
  CASE WHEN v.status IN ('draft_by_electrician', 'draft_by_architect', 'approved_pending_shop_confirmation', 'approved_pending_supply', 'partially_supplied', 'substitute_suggested', 'substitute_accepted') THEN TRUE ELSE FALSE END AS in_pending_general,
  CASE WHEN v.status = 'pending_architect_approval' THEN TRUE ELSE FALSE END AS in_architect_approval_pending,
  CASE WHEN v.status = 'pending_customer_approval' THEN TRUE ELSE FALSE END AS in_customer_approval_pending,
  CASE WHEN v.status IN ('approved_pending_supply', 'partially_supplied') THEN TRUE ELSE FALSE END AS in_shop_supply_pending
FROM public.vw_site_order_item_enriched v
WHERE v.electrician_id IS NOT NULL;

-- View 14: Architect New Projects
CREATE OR REPLACE VIEW public.vw_architect_new_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.architect_required,
  s.approval_mode,
  s.estimated_budget,
  s.status,
  s.description,
  s.created_at,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  customer.phone AS customer_phone,
  s.tenant_id
FROM public.sites s
JOIN public.users customer ON customer.id = s.customer_id
WHERE s.status = 'open_for_bidding'
  AND s.architect_required = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = s.id
      AND sa.role = 'architect'
      AND sa.status = 'active'
  );

-- View 15: Architect Ongoing Projects
CREATE OR REPLACE VIEW public.vw_architect_ongoing_projects
WITH (security_invoker = true)
AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status AS site_status,
  customer.id AS customer_id,
  customer.full_name AS customer_name,
  sa.user_id AS architect_id,
  architect.full_name AS architect_name,
  electrician.id AS electrician_id,
  electrician.full_name AS electrician_name,
  COUNT(DISTINCT oi.id) AS total_material_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_architect_approval') AS electrician_requested_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'pending_customer_approval') AS customer_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status IN ('approved_pending_supply', 'partially_supplied')) AS supply_pending_items,
  COUNT(DISTINCT oi.id) FILTER (WHERE oi.status = 'supplied') AS supplied_items,
  s.tenant_id
FROM public.site_assignments sa
JOIN public.sites s ON s.id = sa.site_id
JOIN public.users architect ON architect.id = sa.user_id
JOIN public.users customer ON customer.id = s.customer_id
LEFT JOIN public.site_assignments sa_ele
  ON sa_ele.site_id = s.id
  AND sa_ele.role = 'electrician'
  AND sa_ele.status = 'active'
LEFT JOIN public.users electrician ON electrician.id = sa_ele.user_id
LEFT JOIN public.order_items oi ON oi.site_id = s.id
WHERE sa.role = 'architect'
  AND sa.status = 'active'
  AND s.status IN ('assigned', 'in_progress', 'on_hold')
GROUP BY
  s.id,
  s.site_code,
  s.site_name,
  s.project_type,
  s.city,
  s.state,
  s.area_sqft,
  s.approval_mode,
  s.estimated_budget,
  s.actual_spend,
  s.status,
  customer.id,
  customer.full_name,
  sa.user_id,
  architect.full_name,
  electrician.id,
  electrician.full_name;

-- View 16: Architect Material Tracker
CREATE OR REPLACE VIEW public.vw_architect_material_tracker
WITH (security_invoker = true)
AS
SELECT
  v.*,
  CASE WHEN v.status <> 'cancelled' THEN TRUE ELSE FALSE END AS in_master_materials_required_list,
  CASE WHEN v.status = 'pending_architect_approval' THEN TRUE ELSE FALSE END AS in_materials_required_by_electrician,
  CASE WHEN v.status = 'supplied' THEN TRUE ELSE FALSE END AS in_material_already_supplied,
  CASE WHEN v.status = 'pending_customer_approval' THEN TRUE ELSE FALSE END AS in_architect_approved_pending_customer,
  CASE WHEN v.status IN ('approved_pending_supply', 'partially_supplied') THEN TRUE ELSE FALSE END AS in_completely_approved_pending_supply
FROM public.vw_site_order_item_enriched v
WHERE v.architect_id IS NOT NULL;

-- View 17: Product Requests Enriched
CREATE OR REPLACE VIEW public.vw_product_requests_enriched
WITH (security_invoker = true)
AS
SELECT
  pr.id,
  pr.site_id,
  s.site_name,
  s.site_code,
  pr.requested_by_user_id,
  requester.full_name AS requested_by_name,
  pr.title,
  pr.preferred_category,
  pr.preferred_brand,
  pr.description,
  pr.status,
  pr.matched_product_id,
  p.item_name AS matched_product_name,
  pr.admin_notes,
  pr.ordered_at,
  pr.fulfilled_at,
  pr.created_at,
  pr.updated_at,
  pr.tenant_id
FROM public.product_requests pr
JOIN public.sites s ON s.id = pr.site_id
JOIN public.users requester ON requester.id = pr.requested_by_user_id
LEFT JOIN public.products p ON p.id = pr.matched_product_id;

-- View 18: Enriched Site Notes
CREATE OR REPLACE VIEW public.vw_site_notes_enriched
WITH (security_invoker = true)
AS
SELECT
  sn.id,
  sn.site_id,
  s.site_name,
  s.site_code,
  sn.sender_user_id,
  sender.full_name AS sender_name,
  sn.recipient_role,
  sn.recipient_user_id,
  recipient.full_name AS recipient_name,
  sn.note_text,
  sn.created_at,
  sn.updated_at,
  sn.tenant_id
FROM public.site_notes sn
JOIN public.sites s ON s.id = sn.site_id
JOIN public.users sender ON sender.id = sn.sender_user_id
LEFT JOIN public.users recipient ON recipient.id = sn.recipient_user_id;


-- ---------------------------------------------------------------------
-- 6. RE-APPLY SELECT PRIVILEGES TO ALL CREATED VIEWS
-- ---------------------------------------------------------------------
GRANT SELECT ON public.vw_recent_order_workflow_events TO authenticated;
GRANT SELECT ON public.vw_order_workflow_timeline TO authenticated;
GRANT SELECT ON public.vw_stuck_order_workflows TO authenticated;
GRANT SELECT ON public.vw_order_workflow_actor_history TO authenticated;

GRANT SELECT ON public.vw_site_order_item_enriched TO authenticated;
GRANT SELECT ON public.vw_customer_site_projects TO authenticated;
GRANT SELECT ON public.vw_customer_budget_tracker TO authenticated;
GRANT SELECT ON public.vw_customer_items_on_approval TO authenticated;
GRANT SELECT ON public.vw_customer_finance_applications TO authenticated;
GRANT SELECT ON public.vw_electrician_new_projects TO authenticated;
GRANT SELECT ON public.vw_electrician_projects_assigned_to_others TO authenticated;
GRANT SELECT ON public.vw_electrician_ongoing_projects TO authenticated;
GRANT SELECT ON public.vw_electrician_material_tracker TO authenticated;
GRANT SELECT ON public.vw_architect_new_projects TO authenticated;
GRANT SELECT ON public.vw_architect_ongoing_projects TO authenticated;
GRANT SELECT ON public.vw_architect_material_tracker TO authenticated;
GRANT SELECT ON public.vw_product_requests_enriched TO authenticated;
GRANT SELECT ON public.vw_site_notes_enriched TO authenticated;


-- ---------------------------------------------------------------------
-- 7. CLEAN ORPHAN RECORDS & BIND MISSING FOREIGN KEY RELATIONSHIP
-- ---------------------------------------------------------------------
DELETE FROM public.savings_plan_subscriptions
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM public.users);

ALTER TABLE public.savings_plan_subscriptions
  DROP CONSTRAINT IF EXISTS savings_plan_subscriptions_user_id_fkey;

ALTER TABLE public.savings_plan_subscriptions
  ADD CONSTRAINT savings_plan_subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


-- ---------------------------------------------------------------------
-- 8. RELOAD POSTGREST CACHE TO INSTANTLY REGISTER THE NEW VIEWS & SCHEMAS
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
