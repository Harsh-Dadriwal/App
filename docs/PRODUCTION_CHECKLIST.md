# Mahalaxmi Electricals — Production Deployment Checklist

This document details the checklist and verification steps required before deploying Mahalaxmi Electricals to production.

---

## 1. Automated Verification Checks (Must Pass in CI)

```bash
# 1. Dependency check
npm ci

# 2. Typecheck entire monorepo
npx tsc --noEmit

# 3. Lint Next.js & components
npm run lint

# 4. Build NestJS API
npm run build:api

# 5. Build Next.js Web App
npm run build

# 6. Run complete API & Security Test Suite
npm run test:api
```

---

## 2. Infrastructure & Secret Setup Checklist

- [ ] **Database & Migrations**: Apply all SQL migrations in `db/` (`full_project_rebuild_complete.sql`, `partner_incentive_engine.sql`, `contractor_credit_engine.sql`, `project_media_foundation.sql`, `project_platform_foundation.sql`) to Supabase PostgreSQL instance.
- [ ] **Supabase Credentials**: Set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] **Razorpay API Keys**: Configure production `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
- [ ] **Cloudflare R2 Storage**: Configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PROJECT_MEDIA_BUCKET`, and `R2_PUBLIC_BASE_URL`.
- [ ] **Redis / BullMQ (Optional for Queue Processing)**: Configure `REDIS_URL` if queue worker processing is enabled.
- [ ] **Node.js Environment**: Set `NODE_NODE_ENV=production` and configure `PORT` (default 4000).

---

## 3. Production Security Verification

- [x] All 74 tests passing without skips or flags.
- [x] No hardcoded production API keys or tokens in repository.
- [x] Whitelisted DTO payload validation active globally via NestJS `ValidationPipe`.
- [x] Cross-tenant access prevented by `TenantAccessService` and database RLS.
- [x] Financial transactions secured with `FOR UPDATE` locks and server-side amount calculation.
