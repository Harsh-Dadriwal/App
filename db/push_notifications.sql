-- Phone push notifications and more notification events
-- Additive SQL migration.
-- 1. push_tokens: the Expo push token of each signed-in phone.
-- 2. Every row added to notifications (from the API or from database functions) is also
--    sent to that person's phones through Expo's push service, in batches, via pg_net.
--    A push failure never blocks the notification itself.
-- 3. New events: admins hear about new customers; partners hear what they earned.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'android',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON public.push_tokens (user_id);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_tokens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_push_for_new_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  messages JSONB;
  total INTEGER;
  chunk JSONB;
  batch INTEGER;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'to', t.token,
           'title', n.title,
           'body', n.body,
           'sound', 'default',
           'priority', 'high',
           'channelId', 'default',
           'data', COALESCE(n.data, '{}'::JSONB) || jsonb_build_object('notificationId', n.id)
         )), '[]'::JSONB)
  INTO messages
  FROM new_rows n
  JOIN public.push_tokens t ON t.user_id = n.user_id;

  total := jsonb_array_length(messages);
  IF total = 0 THEN
    RETURN NULL;
  END IF;

  -- Expo accepts up to 100 messages per request.
  FOR batch IN 0 .. (total - 1) / 100 LOOP
    SELECT jsonb_agg(m.value) INTO chunk
    FROM jsonb_array_elements(messages) WITH ORDINALITY AS m(value, idx)
    WHERE m.idx > batch * 100 AND m.idx <= (batch + 1) * 100;

    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := chunk,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
    );
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Push notification send failed: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notifications_send_push ON public.notifications;
CREATE TRIGGER notifications_send_push
  AFTER INSERT ON public.notifications
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.send_push_for_new_notifications();

-- Admins hear about every new customer who joins their workspace.
CREATE OR REPLACE FUNCTION public.notify_admins_of_new_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  person RECORD;
BEGIN
  SELECT u.full_name, u.phone, u.role::TEXT AS role INTO person FROM public.users u WHERE u.id = NEW.user_id;
  IF person.role IS DISTINCT FROM 'customer' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (tenant_id, user_id, type, title, body, data)
  SELECT NEW.tenant_id, admin_user.id, 'general', 'New customer joined',
         COALESCE(NULLIF(person.full_name, ''), 'A customer') || COALESCE(' · ' || person.phone, '') || ' signed up.',
         jsonb_build_object('module', 'users', 'userId', NEW.user_id)
  FROM public.users admin_user
  WHERE admin_user.status = 'active'
    AND admin_user.id <> NEW.user_id
    AND (admin_user.role::TEXT = 'admin'
         OR EXISTS (SELECT 1 FROM public.tenant_memberships m
                    WHERE m.user_id = admin_user.id AND m.tenant_id = NEW.tenant_id AND m.is_active AND m.role::TEXT IN ('admin', 'tenant_admin')));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'New customer notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_memberships_notify_new_customer ON public.tenant_memberships;
CREATE TRIGGER tenant_memberships_notify_new_customer
  AFTER INSERT ON public.tenant_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admins_of_new_customer();

-- Partners hear what each delivered order earned them.
CREATE OR REPLACE FUNCTION public.notify_partner_of_incentive()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.entry_type = 'commission' AND NEW.commission_amount > 0 THEN
    INSERT INTO public.notifications (tenant_id, user_id, type, title, body, data)
    VALUES (
      NEW.tenant_id, NEW.partner_id, 'general',
      'You earned ₹' || TO_CHAR(NEW.commission_amount, 'FM99,99,99,990.00') || ' incentive',
      COALESCE(REPLACE(NEW.description, 'Incentive for ', 'For '), 'For a delivered order') || ' (' || NEW.commission_percent::TEXT || '% on ₹' || TO_CHAR(NEW.business_amount, 'FM99,99,99,990') || ').',
      jsonb_build_object('module', 'partner_incentives', 'orderRequestId', NEW.order_request_id)
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Incentive notification failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_ledger_notify_incentive ON public.partner_commission_ledger;
CREATE TRIGGER partner_ledger_notify_incentive
  AFTER INSERT ON public.partner_commission_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_partner_of_incentive();

COMMIT;
