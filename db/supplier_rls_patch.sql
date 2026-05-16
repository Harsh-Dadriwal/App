-- db/supplier_rls_patch.sql
-- Adds RLS policies for the new 'supplier' role to manage fulfillment and inventory.

BEGIN;

-- 1. Product Inventory
-- Suppliers need to update available_qty and reserved_qty during fulfillment.
CREATE POLICY product_inventory_supplier_update ON public.product_inventory
  FOR UPDATE TO authenticated
  USING (public.current_profile_role() = 'supplier'::public.user_role)
  WITH CHECK (public.current_profile_role() = 'supplier'::public.user_role);

-- 2. Site Orders
-- Suppliers need to read orders that are approved_pending_shop_confirmation or approved_pending_supply.
CREATE POLICY site_orders_supplier_read ON public.site_orders
  FOR SELECT TO authenticated
  USING (
    public.current_profile_role() = 'supplier'::public.user_role
    -- Can add status filter here, but standard read is usually fine for operations.
  );

-- 3. Order Items
-- Suppliers need to read order items to fulfill them, and update their status to 'supplied'.
CREATE POLICY order_items_supplier_read ON public.order_items
  FOR SELECT TO authenticated
  USING (
    public.current_profile_role() = 'supplier'::public.user_role
  );

CREATE POLICY order_items_supplier_update ON public.order_items
  FOR UPDATE TO authenticated
  USING (public.current_profile_role() = 'supplier'::public.user_role)
  WITH CHECK (public.current_profile_role() = 'supplier'::public.user_role);

-- 4. Substitute Suggestions
-- Suppliers need to suggest substitutes when items are out of stock.
CREATE POLICY substitute_suggestions_supplier_insert ON public.substitute_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_profile_role() = 'supplier'::public.user_role
    AND suggested_by = public.current_profile_id()
  );

-- 5. Updated RPC for Inventory Deduction
CREATE OR REPLACE FUNCTION public.mark_order_item_supplied(target_order_item_id UUID, supplied_qty NUMERIC, note_text TEXT DEFAULT NULL)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE current_required NUMERIC; current_supplied NUMERIC; new_total NUMERIC; next_status public.order_item_status;
  item_product_id UUID;
BEGIN
  IF NOT public.is_admin_user() AND public.current_profile_role() != 'supplier'::public.user_role THEN
    RAISE EXCEPTION 'Only admin or supplier can mark supply';
  END IF;
  SELECT quantity_required, quantity_supplied, product_id INTO current_required, current_supplied, item_product_id FROM public.order_items WHERE id = target_order_item_id;
  new_total := COALESCE(current_supplied, 0) + COALESCE(supplied_qty, 0);
  next_status := CASE WHEN new_total >= current_required THEN 'supplied' ELSE 'partially_supplied' END;
  
  UPDATE public.order_items
  SET quantity_supplied = LEAST(new_total, current_required),
      supplied_by = public.current_profile_id(),
      supplied_at = NOW(),
      admin_notes = COALESCE(note_text, admin_notes),
      shop_confirmed_by = COALESCE(shop_confirmed_by, public.current_profile_id()),
      shop_confirmed_at = COALESCE(shop_confirmed_at, NOW())
  WHERE id = target_order_item_id;

  -- Deduct from inventory
  UPDATE public.product_inventory
  SET available_qty = GREATEST(available_qty - COALESCE(supplied_qty, 0), 0),
      reserved_qty = GREATEST(reserved_qty - COALESCE(supplied_qty, 0), 0)
  WHERE product_id = item_product_id;

  RETURN public.record_order_item_status(target_order_item_id, next_status, note_text);
END;
$$;

COMMIT;

