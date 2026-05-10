BEGIN;

CREATE TABLE IF NOT EXISTS public.system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type VARCHAR(120) NOT NULL,
  entity_type VARCHAR(60) NOT NULL CHECK (entity_type IN ('order_item', 'site_order', 'substitute_suggestion')),
  entity_id UUID NOT NULL,
  actor_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_module VARCHAR(120) NOT NULL DEFAULT 'order_workflow',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workflow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_name VARCHAR(120) NOT NULL,
  entity_type VARCHAR(60) NOT NULL CHECK (entity_type IN ('order_item', 'site_order', 'substitute_suggestion')),
  entity_id UUID NOT NULL,
  current_step VARCHAR(120) NOT NULL,
  step_status VARCHAR(60) NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  event_id UUID REFERENCES public.system_events(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.state_transition_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(60) NOT NULL CHECK (entity_type IN ('order_item', 'site_order', 'substitute_suggestion')),
  from_state VARCHAR(80) NOT NULL,
  to_state VARCHAR(80) NOT NULL,
  transition_key VARCHAR(120) NOT NULL,
  allowed_actor_scope VARCHAR(60) NOT NULL CHECK (allowed_actor_scope IN ('customer', 'architect', 'admin', 'electrician', 'system')),
  workflow_name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_state_transition_catalog_unique
ON public.state_transition_catalog(entity_type, from_state, transition_key, allowed_actor_scope);

CREATE INDEX IF NOT EXISTS idx_system_events_tenant_created_at
ON public.system_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_events_entity_created_at
ON public.system_events(tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_logs_entity
ON public.workflow_logs(tenant_id, workflow_name, entity_type, entity_id);

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_transition_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_events_select_access ON public.system_events;
CREATE POLICY system_events_select_access
ON public.system_events
FOR SELECT TO authenticated
USING (
  public.can_administer_tenant(tenant_id)
  OR (
    entity_type = 'order_item'
    AND EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.id = entity_id
        AND public.can_access_site(oi.site_id)
    )
  )
  OR (
    entity_type = 'site_order'
    AND EXISTS (
      SELECT 1
      FROM public.site_orders so
      WHERE so.id = entity_id
        AND public.can_access_site(so.site_id)
    )
  )
  OR (
    entity_type = 'substitute_suggestion'
    AND EXISTS (
      SELECT 1
      FROM public.substitute_suggestions ss
      JOIN public.order_items oi
        ON oi.id = ss.original_order_item_id
      WHERE ss.id = entity_id
        AND public.can_access_site(oi.site_id)
    )
  )
);

DROP POLICY IF EXISTS workflow_logs_select_access ON public.workflow_logs;
CREATE POLICY workflow_logs_select_access
ON public.workflow_logs
FOR SELECT TO authenticated
USING (
  public.can_administer_tenant(tenant_id)
  OR (
    entity_type = 'order_item'
    AND EXISTS (
      SELECT 1
      FROM public.order_items oi
      WHERE oi.id = entity_id
        AND public.can_access_site(oi.site_id)
    )
  )
  OR (
    entity_type = 'site_order'
    AND EXISTS (
      SELECT 1
      FROM public.site_orders so
      WHERE so.id = entity_id
        AND public.can_access_site(so.site_id)
    )
  )
  OR (
    entity_type = 'substitute_suggestion'
    AND EXISTS (
      SELECT 1
      FROM public.substitute_suggestions ss
      JOIN public.order_items oi
        ON oi.id = ss.original_order_item_id
      WHERE ss.id = entity_id
        AND public.can_access_site(oi.site_id)
    )
  )
);

DROP POLICY IF EXISTS state_transition_catalog_select_access ON public.state_transition_catalog;
CREATE POLICY state_transition_catalog_select_access
ON public.state_transition_catalog
FOR SELECT TO authenticated
USING (TRUE);

CREATE OR REPLACE FUNCTION public.order_workflow_actor_scope(target_site_id UUID, target_tenant_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.can_administer_tenant(target_tenant_id) OR public.is_admin_user() THEN
    RETURN 'admin';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sites s
    WHERE s.id = target_site_id
      AND s.customer_id = public.current_profile_id()
  ) THEN
    RETURN 'customer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = target_site_id
      AND sa.user_id = public.current_profile_id()
      AND sa.status = 'active'
      AND sa.role = 'architect'
  ) THEN
    RETURN 'architect';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.site_assignments sa
    WHERE sa.site_id = target_site_id
      AND sa.user_id = public.current_profile_id()
      AND sa.status = 'active'
      AND sa.role = 'electrician'
  ) THEN
    RETURN 'electrician';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.append_workflow_log(
  target_tenant_id UUID,
  target_workflow_name TEXT,
  target_entity_type TEXT,
  target_entity_id UUID,
  target_step TEXT,
  target_step_status TEXT,
  target_event_id UUID DEFAULT NULL,
  target_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_attempt INTEGER;
  log_id UUID;
BEGIN
  SELECT COALESCE(MAX(attempt_number), 0) + 1
  INTO next_attempt
  FROM public.workflow_logs wl
  WHERE wl.tenant_id = target_tenant_id
    AND wl.workflow_name = target_workflow_name
    AND wl.entity_type = target_entity_type
    AND wl.entity_id = target_entity_id
    AND wl.current_step = target_step;

  INSERT INTO public.workflow_logs (
    tenant_id,
    workflow_name,
    entity_type,
    entity_id,
    current_step,
    step_status,
    attempt_number,
    event_id,
    notes
  )
  VALUES (
    target_tenant_id,
    target_workflow_name,
    target_entity_type,
    target_entity_id,
    target_step,
    target_step_status,
    next_attempt,
    target_event_id,
    target_notes
  )
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_system_event(
  target_tenant_id UUID,
  target_event_type TEXT,
  target_entity_type TEXT,
  target_entity_id UUID,
  target_payload JSONB DEFAULT '{}'::jsonb,
  target_correlation_id UUID DEFAULT gen_random_uuid(),
  target_source_module TEXT DEFAULT 'order_workflow'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event_id UUID;
BEGIN
  INSERT INTO public.system_events (
    tenant_id,
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    correlation_id,
    source_module,
    payload
  )
  VALUES (
    target_tenant_id,
    target_event_type,
    target_entity_type,
    target_entity_id,
    public.current_profile_id(),
    target_correlation_id,
    target_source_module,
    COALESCE(target_payload, '{}'::jsonb)
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_item_workflow_event(
  target_order_item_id UUID,
  target_event_type TEXT,
  target_payload JSONB DEFAULT '{}'::jsonb,
  target_workflow_name TEXT DEFAULT 'order_item_workflow',
  target_step_name TEXT DEFAULT NULL,
  target_step_status TEXT DEFAULT 'completed',
  target_notes TEXT DEFAULT NULL,
  target_correlation_id UUID DEFAULT gen_random_uuid(),
  target_source_module TEXT DEFAULT 'order_workflow'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row public.order_items;
  event_id UUID;
BEGIN
  SELECT *
  INTO item_row
  FROM public.order_items
  WHERE id = target_order_item_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  IF NOT public.can_access_site(item_row.site_id) AND NOT public.can_administer_tenant(item_row.tenant_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  event_id := public.insert_system_event(
    item_row.tenant_id,
    target_event_type,
    'order_item',
    item_row.id,
    target_payload,
    target_correlation_id,
    target_source_module
  );

  PERFORM public.append_workflow_log(
    item_row.tenant_id,
    target_workflow_name,
    'order_item',
    item_row.id,
    COALESCE(target_step_name, target_event_type),
    target_step_status,
    event_id,
    target_notes
  );

  RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_site_order_internal(
  target_site_order_id UUID,
  target_transition_key TEXT,
  actor_scope_override TEXT DEFAULT NULL,
  note_text TEXT DEFAULT NULL,
  event_payload JSONB DEFAULT '{}'::jsonb,
  target_source_module TEXT DEFAULT 'order_workflow'
)
RETURNS public.site_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.site_orders;
  actor_scope TEXT;
  transition_row public.state_transition_catalog%ROWTYPE;
  updated_order public.site_orders;
  event_id UUID;
  merged_payload JSONB;
BEGIN
  SELECT *
  INTO order_row
  FROM public.site_orders
  WHERE id = target_site_order_id;

  IF order_row.id IS NULL THEN
    RAISE EXCEPTION 'Site order not found';
  END IF;

  actor_scope := COALESCE(
    actor_scope_override,
    CASE
      WHEN public.can_administer_tenant(order_row.tenant_id) OR public.is_admin_user() THEN 'admin'
      WHEN order_row.customer_id = public.current_profile_id() THEN 'customer'
      WHEN public.current_profile_role() = 'architect' THEN 'architect'
      WHEN public.current_profile_role() = 'electrician' THEN 'electrician'
      ELSE NULL
    END
  );

  IF actor_scope IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT *
  INTO transition_row
  FROM public.state_transition_catalog stc
  WHERE stc.entity_type = 'site_order'
    AND stc.transition_key = target_transition_key
    AND stc.allowed_actor_scope = actor_scope
    AND stc.is_active = TRUE
    AND (stc.from_state = order_row.status::TEXT OR stc.from_state = '*')
  ORDER BY CASE WHEN stc.from_state = order_row.status::TEXT THEN 0 ELSE 1 END
  LIMIT 1;

  IF transition_row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid site order transition: % from % as %', target_transition_key, order_row.status, actor_scope;
  END IF;

  UPDATE public.site_orders
  SET
    status = transition_row.to_state::public.order_status,
    confirmed_at = CASE
      WHEN transition_row.to_state = 'confirmed'
      THEN COALESCE(confirmed_at, NOW())
      ELSE confirmed_at
    END,
    supplied_at = CASE
      WHEN transition_row.to_state = 'supplied'
      THEN COALESCE(supplied_at, NOW())
      ELSE supplied_at
    END,
    cancelled_at = CASE
      WHEN transition_row.to_state = 'cancelled'
      THEN COALESCE(cancelled_at, NOW())
      ELSE cancelled_at
    END,
    updated_at = NOW()
  WHERE id = order_row.id
  RETURNING * INTO updated_order;

  merged_payload := COALESCE(event_payload, '{}'::jsonb)
    || jsonb_build_object(
      'transition_key', target_transition_key,
      'from_state', order_row.status::TEXT,
      'to_state', transition_row.to_state,
      'actor_scope', actor_scope
    );

  event_id := public.insert_system_event(
    order_row.tenant_id,
    'site_order_transition',
    'site_order',
    order_row.id,
    merged_payload,
    gen_random_uuid(),
    target_source_module
  );

  PERFORM public.append_workflow_log(
    order_row.tenant_id,
    transition_row.workflow_name,
    'site_order',
    order_row.id,
    target_transition_key,
    'completed',
    event_id,
    note_text
  );

  RETURN updated_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_site_order(
  target_site_order_id UUID,
  target_transition_key TEXT,
  note_text TEXT DEFAULT NULL,
  event_payload JSONB DEFAULT '{}'::jsonb,
  target_source_module TEXT DEFAULT 'order_workflow'
)
RETURNS public.site_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.transition_site_order_internal(
    target_site_order_id,
    target_transition_key,
    NULL,
    note_text,
    event_payload,
    target_source_module
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_site_order_workflow(
  target_site_order_id UUID,
  note_text TEXT DEFAULT NULL,
  target_source_module TEXT DEFAULT 'order_workflow_rollup'
)
RETURNS public.site_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_row public.site_orders;
  total_items INTEGER;
  awaiting_count INTEGER;
  approval_ready_count INTEGER;
  supply_ready_count INTEGER;
  partial_supply_count INTEGER;
  supplied_count INTEGER;
  closed_count INTEGER;
  desired_status public.order_status;
  transition_key TEXT;
BEGIN
  SELECT *
  INTO order_row
  FROM public.site_orders
  WHERE id = target_site_order_id;

  IF order_row.id IS NULL THEN
    RAISE EXCEPTION 'Site order not found';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('pending_architect_approval', 'pending_customer_approval', 'substitute_suggested')),
    COUNT(*) FILTER (WHERE status = 'approved_pending_shop_confirmation'),
    COUNT(*) FILTER (WHERE status = 'approved_pending_supply'),
    COUNT(*) FILTER (WHERE status = 'partially_supplied'),
    COUNT(*) FILTER (WHERE status = 'supplied'),
    COUNT(*) FILTER (WHERE status IN ('cancelled', 'rejected_by_architect', 'rejected_by_customer', 'substitute_rejected'))
  INTO
    total_items,
    awaiting_count,
    approval_ready_count,
    supply_ready_count,
    partial_supply_count,
    supplied_count,
    closed_count
  FROM public.order_items
  WHERE site_order_id = target_site_order_id;

  IF total_items = 0 THEN
    desired_status := 'draft';
  ELSIF supplied_count = total_items THEN
    desired_status := 'supplied';
  ELSIF supplied_count > 0 OR partial_supply_count > 0 THEN
    desired_status := 'partially_supplied';
  ELSIF supply_ready_count > 0 THEN
    desired_status := 'processing';
  ELSIF approval_ready_count > 0 AND awaiting_count = 0 THEN
    desired_status := 'confirmed';
  ELSIF approval_ready_count > 0 AND awaiting_count > 0 THEN
    desired_status := 'partially_approved';
  ELSIF awaiting_count > 0 THEN
    desired_status := 'awaiting_approval';
  ELSIF closed_count = total_items THEN
    desired_status := 'cancelled';
  ELSE
    desired_status := order_row.status;
  END IF;

  IF desired_status = order_row.status THEN
    RETURN order_row;
  END IF;

  transition_key := CASE desired_status
    WHEN 'draft' THEN 'system_rollup_to_draft'
    WHEN 'awaiting_approval' THEN 'system_rollup_to_awaiting_approval'
    WHEN 'partially_approved' THEN 'system_rollup_to_partially_approved'
    WHEN 'confirmed' THEN 'system_rollup_to_confirmed'
    WHEN 'processing' THEN 'system_rollup_to_processing'
    WHEN 'partially_supplied' THEN 'system_rollup_to_partially_supplied'
    WHEN 'supplied' THEN 'system_rollup_to_supplied'
    WHEN 'cancelled' THEN 'system_rollup_to_cancelled'
    ELSE NULL
  END;

  IF transition_key IS NULL THEN
    RETURN order_row;
  END IF;

  RETURN public.transition_site_order_internal(
    target_site_order_id,
    transition_key,
    'system',
    note_text,
    jsonb_build_object(
      'rollup', TRUE,
      'total_items', total_items,
      'awaiting_count', awaiting_count,
      'approval_ready_count', approval_ready_count,
      'supply_ready_count', supply_ready_count,
      'partial_supply_count', partial_supply_count,
      'supplied_count', supplied_count,
      'closed_count', closed_count
    ),
    target_source_module
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_order_item_internal(
  target_order_item_id UUID,
  target_transition_key TEXT,
  actor_scope_override TEXT DEFAULT NULL,
  note_text TEXT DEFAULT NULL,
  event_payload JSONB DEFAULT '{}'::jsonb,
  target_source_module TEXT DEFAULT 'order_workflow'
)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row public.order_items;
  transition_row public.state_transition_catalog%ROWTYPE;
  actor_scope TEXT;
  updated_item public.order_items;
  event_id UUID;
  merged_payload JSONB;
BEGIN
  SELECT *
  INTO item_row
  FROM public.order_items
  WHERE id = target_order_item_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  actor_scope := COALESCE(
    actor_scope_override,
    public.order_workflow_actor_scope(item_row.site_id, item_row.tenant_id)
  );

  IF actor_scope IS NULL THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT *
  INTO transition_row
  FROM public.state_transition_catalog stc
  WHERE stc.entity_type = 'order_item'
    AND stc.transition_key = target_transition_key
    AND stc.allowed_actor_scope = actor_scope
    AND stc.is_active = TRUE
    AND (stc.from_state = item_row.status::TEXT OR stc.from_state = '*')
  ORDER BY CASE WHEN stc.from_state = item_row.status::TEXT THEN 0 ELSE 1 END
  LIMIT 1;

  IF transition_row.id IS NULL THEN
    RAISE EXCEPTION 'Invalid order item transition: % from % as %', target_transition_key, item_row.status, actor_scope;
  END IF;

  UPDATE public.order_items
  SET
    status = transition_row.to_state::public.order_item_status,
    architect_notes = CASE
      WHEN target_transition_key IN ('architect_approve', 'architect_reject')
      THEN COALESCE(note_text, architect_notes)
      ELSE architect_notes
    END,
    architect_reviewed_by = CASE
      WHEN target_transition_key IN ('architect_approve', 'architect_reject')
      THEN public.current_profile_id()
      ELSE architect_reviewed_by
    END,
    architect_reviewed_at = CASE
      WHEN target_transition_key IN ('architect_approve', 'architect_reject')
      THEN NOW()
      ELSE architect_reviewed_at
    END,
    customer_notes = CASE
      WHEN target_transition_key IN ('customer_approve', 'customer_reject', 'accept_substitute', 'reject_substitute')
      THEN COALESCE(note_text, customer_notes)
      ELSE customer_notes
    END,
    customer_reviewed_by = CASE
      WHEN target_transition_key IN ('customer_approve', 'customer_reject', 'accept_substitute', 'reject_substitute')
      THEN public.current_profile_id()
      ELSE customer_reviewed_by
    END,
    customer_reviewed_at = CASE
      WHEN target_transition_key IN ('customer_approve', 'customer_reject', 'accept_substitute', 'reject_substitute')
      THEN NOW()
      ELSE customer_reviewed_at
    END,
    admin_notes = CASE
      WHEN target_transition_key IN ('suggest_substitute', 'record_partial_supply', 'record_full_supply', 'shop_confirm', 'cancel_order_item')
      THEN COALESCE(note_text, admin_notes)
      ELSE admin_notes
    END,
    shop_confirmed_by = CASE
      WHEN target_transition_key IN ('shop_confirm', 'record_partial_supply', 'record_full_supply')
      THEN COALESCE(shop_confirmed_by, public.current_profile_id())
      ELSE shop_confirmed_by
    END,
    shop_confirmed_at = CASE
      WHEN target_transition_key IN ('shop_confirm', 'record_partial_supply', 'record_full_supply')
      THEN COALESCE(shop_confirmed_at, NOW())
      ELSE shop_confirmed_at
    END,
    quantity_supplied = CASE
      WHEN target_transition_key IN ('record_partial_supply', 'record_full_supply')
      THEN COALESCE((event_payload ->> 'new_total_supplied')::NUMERIC, quantity_supplied)
      ELSE quantity_supplied
    END,
    supplied_by = CASE
      WHEN target_transition_key IN ('record_partial_supply', 'record_full_supply')
      THEN public.current_profile_id()
      ELSE supplied_by
    END,
    supplied_at = CASE
      WHEN target_transition_key IN ('record_partial_supply', 'record_full_supply')
      THEN NOW()
      ELSE supplied_at
    END,
    updated_at = NOW()
  WHERE id = item_row.id
  RETURNING * INTO updated_item;

  INSERT INTO public.order_item_status_history (
    order_item_id,
    from_status,
    to_status,
    changed_by,
    change_reason,
    metadata,
    tenant_id
  )
  VALUES (
    item_row.id,
    item_row.status,
    transition_row.to_state::public.order_item_status,
    public.current_profile_id(),
    note_text,
    COALESCE(event_payload, '{}'::jsonb),
    item_row.tenant_id
  );

  merged_payload := COALESCE(event_payload, '{}'::jsonb)
    || jsonb_build_object(
      'transition_key', target_transition_key,
      'from_state', item_row.status::TEXT,
      'to_state', transition_row.to_state,
      'actor_scope', actor_scope,
      'site_order_id', item_row.site_order_id,
      'site_id', item_row.site_id
    );

  event_id := public.insert_system_event(
    item_row.tenant_id,
    'order_item_transition',
    'order_item',
    item_row.id,
    merged_payload,
    gen_random_uuid(),
    target_source_module
  );

  PERFORM public.append_workflow_log(
    item_row.tenant_id,
    transition_row.workflow_name,
    'order_item',
    item_row.id,
    target_transition_key,
    'completed',
    event_id,
    note_text
  );

  PERFORM public.sync_site_order_workflow(
    item_row.site_order_id,
    COALESCE(note_text, 'Order item workflow transition'),
    target_source_module
  );

  RETURN updated_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_order_item(
  target_order_item_id UUID,
  target_transition_key TEXT,
  note_text TEXT DEFAULT NULL,
  event_payload JSONB DEFAULT '{}'::jsonb,
  target_source_module TEXT DEFAULT 'order_workflow'
)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.transition_order_item_internal(
    target_order_item_id,
    target_transition_key,
    NULL,
    note_text,
    event_payload,
    target_source_module
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_substitute_workflow(
  original_item_id UUID,
  suggested_product UUID,
  reason_text TEXT DEFAULT NULL
)
RETURNS public.substitute_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row public.order_items;
  site_customer UUID;
  result_row public.substitute_suggestions;
  event_id UUID;
BEGIN
  SELECT oi.*
  INTO item_row
  FROM public.order_items oi
  WHERE oi.id = original_item_id;

  SELECT s.customer_id
  INTO site_customer
  FROM public.sites s
  WHERE s.id = item_row.site_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  IF site_customer IS NULL THEN
    RAISE EXCEPTION 'Customer not found for order item %', original_item_id;
  END IF;

  IF NOT public.can_administer_tenant(item_row.tenant_id) AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can suggest substitutes';
  END IF;

  INSERT INTO public.substitute_suggestions (
    original_order_item_id,
    suggested_product_id,
    suggested_by,
    customer_id,
    status,
    reason,
    tenant_id
  )
  VALUES (
    original_item_id,
    suggested_product,
    public.current_profile_id(),
    site_customer,
    'suggested',
    reason_text,
    item_row.tenant_id
  )
  RETURNING * INTO result_row;

  PERFORM public.transition_order_item(
    original_item_id,
    'suggest_substitute',
    reason_text,
    jsonb_build_object(
      'suggestion_id', result_row.id,
      'suggested_product_id', suggested_product
    ),
    'substitute_workflow'
  );

  event_id := public.insert_system_event(
    item_row.tenant_id,
    'substitute_workflow_started',
    'substitute_suggestion',
    result_row.id,
    jsonb_build_object(
      'original_order_item_id', original_item_id,
      'suggested_product_id', suggested_product
    ),
    gen_random_uuid(),
    'substitute_workflow'
  );

  PERFORM public.append_workflow_log(
    item_row.tenant_id,
    'substitute_workflow',
    'substitute_suggestion',
    result_row.id,
    'suggest_substitute',
    'completed',
    event_id,
    reason_text
  );

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_substitute_workflow(
  suggestion_id UUID,
  accept_choice BOOLEAN,
  note_text TEXT DEFAULT NULL
)
RETURNS public.substitute_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_row public.substitute_suggestions;
  item_row public.order_items;
  transition_key TEXT;
  final_note TEXT;
  event_id UUID;
BEGIN
  UPDATE public.substitute_suggestions
  SET
    status = CASE WHEN accept_choice THEN 'accepted' ELSE 'rejected' END,
    customer_response_at = NOW(),
    updated_at = NOW()
  WHERE id = suggestion_id
    AND customer_id = public.current_profile_id()
  RETURNING * INTO result_row;

  IF result_row.id IS NULL THEN
    RAISE EXCEPTION 'Not allowed or suggestion not found';
  END IF;

  SELECT *
  INTO item_row
  FROM public.order_items
  WHERE id = result_row.original_order_item_id;

  transition_key := CASE WHEN accept_choice THEN 'accept_substitute' ELSE 'reject_substitute' END;
  final_note := COALESCE(
    note_text,
    CASE
      WHEN accept_choice THEN 'Customer accepted substitute'
      ELSE 'Customer rejected substitute'
    END
  );

  PERFORM public.transition_order_item(
    result_row.original_order_item_id,
    transition_key,
    final_note,
    jsonb_build_object(
      'suggestion_id', result_row.id,
      'suggested_product_id', result_row.suggested_product_id,
      'substitute_status', result_row.status
    ),
    'substitute_workflow'
  );

  event_id := public.insert_system_event(
    item_row.tenant_id,
    'substitute_workflow_resolved',
    'substitute_suggestion',
    result_row.id,
    jsonb_build_object(
      'original_order_item_id', result_row.original_order_item_id,
      'accepted', accept_choice
    ),
    gen_random_uuid(),
    'substitute_workflow'
  );

  PERFORM public.append_workflow_log(
    item_row.tenant_id,
    'substitute_workflow',
    'substitute_suggestion',
    result_row.id,
    transition_key,
    'completed',
    event_id,
    final_note
  );

  RETURN result_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_supply_progress(
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
  item_row public.order_items;
  new_total NUMERIC;
  transition_key TEXT;
BEGIN
  SELECT *
  INTO item_row
  FROM public.order_items
  WHERE id = target_order_item_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  IF supplied_qty IS NULL OR supplied_qty <= 0 THEN
    RAISE EXCEPTION 'Supplied quantity must be greater than zero';
  END IF;

  IF NOT public.can_administer_tenant(item_row.tenant_id) AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Only admin can mark supply';
  END IF;

  new_total := LEAST(COALESCE(item_row.quantity_supplied, 0) + supplied_qty, item_row.quantity_required);
  transition_key := CASE
    WHEN new_total >= item_row.quantity_required THEN 'record_full_supply'
    ELSE 'record_partial_supply'
  END;

  RETURN public.transition_order_item(
    target_order_item_id,
    transition_key,
    note_text,
    jsonb_build_object(
      'supplied_increment', supplied_qty,
      'new_total_supplied', new_total,
      'quantity_required', item_row.quantity_required
    ),
    'supply_workflow'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_order_item_by_customer(
  target_order_item_id UUID,
  approve BOOLEAN,
  note_text TEXT DEFAULT NULL
)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.transition_order_item(
    target_order_item_id,
    CASE WHEN approve THEN 'customer_approve' ELSE 'customer_reject' END,
    note_text,
    '{}'::jsonb,
    'customer_approval'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_order_item_by_architect(
  target_order_item_id UUID,
  approve BOOLEAN,
  note_text TEXT DEFAULT NULL
)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.transition_order_item(
    target_order_item_id,
    CASE WHEN approve THEN 'architect_approve' ELSE 'architect_reject' END,
    note_text,
    '{}'::jsonb,
    'architect_review'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.suggest_substitute_item(
  original_item_id UUID,
  suggested_product UUID,
  reason_text TEXT DEFAULT NULL
)
RETURNS public.substitute_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.start_substitute_workflow(original_item_id, suggested_product, reason_text);
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_substitute(
  suggestion_id UUID,
  accept_choice BOOLEAN
)
RETURNS public.substitute_suggestions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.resolve_substitute_workflow(suggestion_id, accept_choice, NULL);
END;
$$;

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
BEGIN
  RETURN public.mark_order_supply_progress(target_order_item_id, supplied_qty, note_text);
END;
$$;

INSERT INTO public.state_transition_catalog (
  entity_type,
  from_state,
  to_state,
  transition_key,
  allowed_actor_scope,
  workflow_name,
  is_active,
  notes
)
VALUES
  ('order_item', 'pending_architect_approval', 'pending_customer_approval', 'architect_approve', 'architect', 'order_item_workflow', TRUE, 'Architect approves a pending material line.'),
  ('order_item', 'pending_architect_approval', 'rejected_by_architect', 'architect_reject', 'architect', 'order_item_workflow', TRUE, 'Architect rejects a pending material line.'),
  ('order_item', 'pending_customer_approval', 'approved_pending_shop_confirmation', 'customer_approve', 'customer', 'order_item_workflow', TRUE, 'Customer approves a material line.'),
  ('order_item', 'pending_customer_approval', 'rejected_by_customer', 'customer_reject', 'customer', 'order_item_workflow', TRUE, 'Customer rejects a material line.'),
  ('order_item', 'pending_customer_approval', 'substitute_suggested', 'suggest_substitute', 'admin', 'substitute_workflow', TRUE, 'Admin proposes a substitute before customer confirmation.'),
  ('order_item', 'approved_pending_shop_confirmation', 'substitute_suggested', 'suggest_substitute', 'admin', 'substitute_workflow', TRUE, 'Admin proposes a substitute after approval but before shop confirmation.'),
  ('order_item', 'approved_pending_supply', 'substitute_suggested', 'suggest_substitute', 'admin', 'substitute_workflow', TRUE, 'Admin proposes a substitute after shop confirmation.'),
  ('order_item', 'substitute_suggested', 'approved_pending_shop_confirmation', 'accept_substitute', 'customer', 'substitute_workflow', TRUE, 'Customer accepts the proposed substitute.'),
  ('order_item', 'substitute_suggested', 'substitute_rejected', 'reject_substitute', 'customer', 'substitute_workflow', TRUE, 'Customer rejects the proposed substitute.'),
  ('order_item', 'approved_pending_shop_confirmation', 'approved_pending_supply', 'shop_confirm', 'admin', 'order_item_workflow', TRUE, 'Admin confirms the line for supply.'),
  ('order_item', 'approved_pending_supply', 'partially_supplied', 'record_partial_supply', 'admin', 'supply_workflow', TRUE, 'Admin records partial supply.'),
  ('order_item', 'approved_pending_supply', 'supplied', 'record_full_supply', 'admin', 'supply_workflow', TRUE, 'Admin records full supply.'),
  ('order_item', 'partially_supplied', 'partially_supplied', 'record_partial_supply', 'admin', 'supply_workflow', TRUE, 'Admin records another partial supply.'),
  ('order_item', 'partially_supplied', 'supplied', 'record_full_supply', 'admin', 'supply_workflow', TRUE, 'Admin completes supply after partial deliveries.'),
  ('order_item', '*', 'cancelled', 'cancel_order_item', 'admin', 'order_item_workflow', TRUE, 'Admin cancels a line item.'),
  ('site_order', '*', 'draft', 'system_rollup_to_draft', 'system', 'site_order_workflow', TRUE, 'System rollup sets the order back to draft.'),
  ('site_order', '*', 'awaiting_approval', 'system_rollup_to_awaiting_approval', 'system', 'site_order_workflow', TRUE, 'System rollup sees pending approvals.'),
  ('site_order', '*', 'partially_approved', 'system_rollup_to_partially_approved', 'system', 'site_order_workflow', TRUE, 'System rollup sees approved and pending lines together.'),
  ('site_order', '*', 'confirmed', 'system_rollup_to_confirmed', 'system', 'site_order_workflow', TRUE, 'System rollup sees all lines ready for shop confirmation.'),
  ('site_order', '*', 'processing', 'system_rollup_to_processing', 'system', 'site_order_workflow', TRUE, 'System rollup sees lines ready for supply.'),
  ('site_order', '*', 'partially_supplied', 'system_rollup_to_partially_supplied', 'system', 'site_order_workflow', TRUE, 'System rollup sees partial supply against at least one line.'),
  ('site_order', '*', 'supplied', 'system_rollup_to_supplied', 'system', 'site_order_workflow', TRUE, 'System rollup sees every line fully supplied.'),
  ('site_order', '*', 'cancelled', 'system_rollup_to_cancelled', 'system', 'site_order_workflow', TRUE, 'System rollup sees no actionable lines remaining.'),
  ('site_order', 'confirmed', 'processing', 'admin_start_processing', 'admin', 'site_order_workflow', TRUE, 'Admin moves a confirmed order into processing.'),
  ('site_order', 'processing', 'supplied', 'admin_mark_supplied', 'admin', 'site_order_workflow', TRUE, 'Admin marks the whole order supplied.'),
  ('site_order', 'partially_supplied', 'supplied', 'admin_mark_supplied', 'admin', 'site_order_workflow', TRUE, 'Admin completes a partially supplied order.'),
  ('site_order', 'confirmed', 'supplied', 'admin_mark_supplied', 'admin', 'site_order_workflow', TRUE, 'Admin closes a confirmed order as supplied.'),
  ('site_order', '*', 'cancelled', 'cancel_site_order', 'admin', 'site_order_workflow', TRUE, 'Admin cancels the order header.'),
  ('substitute_suggestion', '*', 'suggested', 'suggest_substitute', 'admin', 'substitute_workflow', TRUE, 'Admin starts substitute workflow.'),
  ('substitute_suggestion', 'suggested', 'accepted', 'accept_substitute', 'customer', 'substitute_workflow', TRUE, 'Customer accepts substitute.'),
  ('substitute_suggestion', 'suggested', 'rejected', 'reject_substitute', 'customer', 'substitute_workflow', TRUE, 'Customer rejects substitute.')
ON CONFLICT (entity_type, from_state, transition_key, allowed_actor_scope)
DO UPDATE SET
  to_state = EXCLUDED.to_state,
  workflow_name = EXCLUDED.workflow_name,
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes;

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

GRANT SELECT ON public.system_events TO authenticated;
GRANT SELECT ON public.workflow_logs TO authenticated;
GRANT SELECT ON public.state_transition_catalog TO authenticated;
GRANT SELECT ON public.vw_recent_order_workflow_events TO authenticated;
GRANT SELECT ON public.vw_order_workflow_timeline TO authenticated;
GRANT SELECT ON public.vw_stuck_order_workflows TO authenticated;
GRANT SELECT ON public.vw_order_workflow_actor_history TO authenticated;

GRANT EXECUTE ON FUNCTION public.order_workflow_actor_scope(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_item_workflow_event(UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_order_item(UUID, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_site_order(UUID, TEXT, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_substitute_workflow(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_substitute_workflow(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_supply_progress(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_site_order_workflow(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_order_item_by_customer(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_order_item_by_architect(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_substitute_item(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_substitute(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_order_item_supplied(UUID, NUMERIC, TEXT) TO authenticated;

COMMIT;
