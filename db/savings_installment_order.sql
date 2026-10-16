-- Savings instalments are paid in order
-- Additive SQL migration. A payment on instalment N is refused while any earlier instalment
-- of the same subscription is still pending or late. Applies to every path that pays an
-- instalment, including pay_savings_installment() called directly. Waiving or cancelling an
-- instalment (no money added) is not affected.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_savings_installment_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  blocking_number INTEGER;
BEGIN
  IF NEW.paid_amount > OLD.paid_amount THEN
    SELECT si.installment_number
      INTO blocking_number
      FROM public.savings_installments si
     WHERE si.subscription_id = NEW.subscription_id
       AND si.installment_number < NEW.installment_number
       AND si.status IN ('pending', 'late')
     ORDER BY si.installment_number
     LIMIT 1;

    IF blocking_number IS NOT NULL THEN
      RAISE EXCEPTION 'Please pay instalment % first. Instalments are paid one after another.', blocking_number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_savings_installments_pay_in_order ON public.savings_installments;
CREATE TRIGGER trg_savings_installments_pay_in_order
  BEFORE UPDATE OF paid_amount ON public.savings_installments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_savings_installment_order();

COMMIT;
