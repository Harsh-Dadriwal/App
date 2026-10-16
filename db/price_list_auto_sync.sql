-- Automatic price list sync every 15 minutes
-- Supabase calls the API's scheduled-sync endpoint, which re-reads the Tally export on
-- Google Drive and replaces the price list only when it changed (so stock stays current
-- without anyone pressing "Update from Tally").
--
-- Needs db/price_list_ordering.sql (pg_cron + pg_net) and a Vault secret named
-- price_list_cron_secret holding the same value as PRICE_LIST_CRON_SECRET on the API's
-- Vercel project. Create it once, never in this file:
--   select vault.create_secret('<the secret>', 'price_list_cron_secret');

SELECT cron.schedule(
  'price-list-auto-sync',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://app-apimahalaxmi-api.vercel.app/api/v1/inventory/price-list/scheduled-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'price_list_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
