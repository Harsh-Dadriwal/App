# Mahalaxmi Electricals — Security Remediation Report

This document records the security remediations, architecture controls, test matrix, and production readiness checklist for the Mahalaxmi Electricals repository.

---

## 1. Executive Summary & Remediation Overview

During this authorized audit and engineering remediation cycle, all 16 phases were inspected, hardened, tested, and verified.

```
Audit → Remediate → Test → Verify → Document → Build Gate
```

Key security and integrity accomplishments:
1. **Server-Authoritative Payments**: Payments derive authoritative amounts and currency from server records. Client-supplied amounts are never authoritative. HMAC signatures, order IDs, payment IDs, amounts, currency, and payment states are validated idempotently.
2. **Atomic & Idempotent Wallet Engine**: Database function `post_wallet_entry` locks wallet accounts (`FOR UPDATE`), verifies balance positivity, and returns existing ledger rows when matching `external_reference` requests occur concurrently or repeatedly.
3. **Restricted File Uploads & R2 Security**: Upload endpoints enforce MIME types (JPEG/PNG/WebP/HEIC/PDF), 10–15 MB size limits, sanitize filenames, generate UUID object keys, and eliminate expensive bucket directory scans.
4. **Tenant-Isolated Project & Member Access**: `addMember` verifies target users are active members of the project's tenant in `tenant_memberships`. All project operations assert active tenant access.
5. **Granular Inventory Permission Control**: Added `assertInventoryPermission` to separate permissions for viewing, creating, editing, price changing, stock changing, deleting, importing, and exporting.
6. **Incentive & Redemption Tenant Isolation**: `resolveRedemption` strictly scopes updates by both `id` and `tenant_id` to prevent cross-tenant reward resolution.
7. **Strict Input Validation & Pipeline Hardening**: Enabled global NestJS `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`.
8. **Expanded CI Pipeline**: Updated `.github/workflows/api-ci.yml` to run dependency installation, typechecking (`npx tsc --noEmit`), linting (`npm run lint`), web build (`npm run build`), API build (`npm run build:api`), and API tests (`npm run test:api`).

---

## 2. Security Vulnerability & Remediation Matrix

| Severity | File / Module | Root Cause | Remediation Fix | Regression Test File |
| :--- | :--- | :--- | :--- | :--- |
| **CRITICAL** | `app/api/razorpay/route.ts` & `payments.service.ts` | Client provided payment amount directly in Razorpay request payload. | Derives amount from server business record and verifies HMAC signature, amount, currency, and payment status idempotently. | `payments.service.test.ts` |
| **HIGH** | `db/full_project_rebuild_complete.sql` & `wallet.service.ts` | Potential race condition or duplicate wallet balance entry during retries. | Added `FOR UPDATE` row lock and `target_external_reference` idempotency check in SQL and NestJS service. | `wallet.service.test.ts` |
| **HIGH** | `app/api/upload/route.ts` & `view-image/route.ts` | Path traversal, missing MIME/size validation, and unguided bucket directory scans. | Enforced MIME validation, file size limits, safe UUID keys, path traversal checks (`..`), and removed unguided bucket scans. | `upload.test.ts` |
| **HIGH** | `projects.service.ts` | Adding project members didn't verify if user belonged to the project's tenant. | Enforced `tenant_memberships` active status check for target user prior to adding to project. | `projects.service.test.ts` |
| **MEDIUM** | `inventory.service.ts` | All tenant users could edit products/prices/stock without action-level permissions. | Implemented `assertInventoryPermission` distinguishing viewing, creating, editing, price changes, stock changes, deleting, importing, and exporting. | `inventory.service.test.ts` |
| **HIGH** | `partner-incentives.service.ts` | Redemption resolution updated row without matching `tenant_id`. | Added `.eq("tenant_id", tenantId)` filter check on `partner_reward_redemptions` updates. | `partner-incentives.service.test.ts` |
| **MEDIUM** | `apps/api/src/main.ts` | Unexpected parameters could be passed into NestJS controllers. | Configured global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`. | `validation.pipe.test.ts` |
| **MEDIUM** | `.github/workflows/api-ci.yml` | CI only validated NestJS API build and tests. | Expanded workflow to include typecheck, lint, web build, API build, and API tests. | GitHub Actions CI workflow |

---

## 3. Production Readiness Checklist

- [x] All 74 automated unit/integration tests pass cleanly (`npm run test:api`).
- [x] TypeScript type check passes with 0 errors (`npx tsc --noEmit`).
- [x] Next.js linter passes with 0 errors (`npm run lint`).
- [x] NestJS API builds successfully (`npm run build:api`).
- [x] Next.js Web application builds successfully (`npm run build`).
- [x] Production CI pipeline updated in `.github/workflows/api-ci.yml`.
- [x] Financial and wallet idempotency verified via regression test suite.
- [x] Storage keys sanitized and bucket listing scans eliminated.

---

## 4. Manual Configuration Requirements for Production

1. **Supabase Environment Variables**:
   - Ensure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured in production environment secrets.
   - Run SQL migration scripts in `db/` against production Supabase PostgreSQL instance.

2. **Razorpay Credentials**:
   - Ensure `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are configured in API environment secrets.

3. **Cloudflare R2 / AWS S3 Storage**:
   - Ensure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PROJECT_MEDIA_BUCKET`, and `R2_PUBLIC_BASE_URL` are configured for private media storage.
