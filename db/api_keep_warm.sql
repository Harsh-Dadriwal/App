-- Keeps the API's serverless function warm so the first request after a quiet spell
-- (login, opening the app) does not wait for a cold start of a couple of seconds.
-- Pings the public /health endpoint every 4 minutes; it needs no secret.
--
-- Needs pg_cron + pg_net (see db/price_list_ordering.sql).
-- Stop it with: select cron.unschedule('api-keep-warm');

SELECT cron.schedule(
  'api-keep-warm',
  '*/4 * * * *',
  $job$
  SELECT net.http_get(
    url := 'https://app-apimahalaxmi-api.vercel.app/health',
    timeout_milliseconds := 10000
  );
  $job$
);
