# Mahalaxmi Electricals — Comprehensive Engineering Audit

This document presents a deep technical audit of the Mahalaxmi Electricals application codebase, database schemas, authorization models, and financial execution flows.

---

## 1. Architecture Overview

Mahalaxmi Electricals is structured as a TypeScript monorepo with NestJS backend API services, Next.js web portal, Supabase database + Auth, and Cloudflare R2 object storage.

```mermaid
graph TD
  Client[Next.js Web / Mobile Client] -->|HTTPS REST| NestAPI[NestJS API Service (apps/api)]
  Client -->|Presigned / Public| R2Storage[Cloudflare R2 / S3 Storage]
  NestAPI -->|PostgreSQL / RLS| SupabaseDB[Supabase Postgres DB]
  NestAPI -->|Async Jobs| RedisBull[Redis + BullMQ Queues]
  NestAPI -->|Payment API| Razorpay[Razorpay Gateway]
```

### Core Workspaces & Folders
- **`app/`**: Next.js App Router frontend routes (`/auth`, `/[role]/[[...slug]]`) and Next.js API routes (`/api/razorpay`, `/api/upload`, `/api/view-image`, `/api/admin/upload-product-image`).
- **`apps/api/`**: NestJS HTTP REST API containing modules for auth, tenancy, projects, project-media, wallet, payments, risk/credit, inventory, partner incentives, requirements/OCR, workflows, and monetization.
- **`packages/core/`**: Shared TypeScript contracts, DTO types, domain types, gateways, and hooks.
- **`db/`**: PostgreSQL SQL schema migrations, triggers, security definer functions, and RLS policies (`contractor_credit_engine.sql`, `full_project_rebuild_complete.sql`, `partner_incentive_engine.sql`, `project_media_foundation.sql`, `project_platform_foundation.sql`).

---

## 2. Modules & API Routes Summary

### NestJS Backend API Modules (`apps/api/src/modules/`)
| Module Name | Controller Path | Primary Purpose |
| :--- | :--- | :--- |
| **`auth`** | `/api/v1/auth` | Exchange Firebase tokens, switch active tenant, manage user profiles. |
| **`projects`** | `/api/v1/projects` | Multi-tenant project workspace creation, room/task hierarchy, project membership. |
| **`project-media`** | `/api/v1/projects/:projectId/media` | Private photo upload signed URLs, recipient-scoped access, completion verification. |
| **`payments`** | `/api/v1/payments` | Razorpay order creation and HMAC verification. |
| **`wallet`** | `/api/v1/wallet` | Multi-tenant ledger posting, balance snapshotting, savings installment, referral rewards. |
| **`inventory`** | `/api/v1/inventory` | Catalog browsing, stock alerts, product velocity, catalog management. |
| **`partner-incentives`** | `/api/v1/partner-incentives` | Partner schemes, performance slabs, commission ledgers, point wallets, reward redemptions. |
| **`requirements`** | `/api/v1/requirements` | Requirement batch creation, OCR extraction, product candidate matching, procurement generation. |
| **`risk`** | `/api/v1/risk/credit` | Credit risk scoring, payment risk prediction, credit limit capping, order approval. |
| **`workflows`** | `/api/v1/workflows` | State machine transitions, customer/architect order item review, professional verification. |

---

## 3. Database Schemas & Row Level Security (RLS)

### Essential SQL Tables
- **Users & Tenancy**: `users`, `tenants`, `tenant_memberships`, `platform_roles`
- **Projects**: `projects`, `project_members`, `project_rooms`, `project_tasks`, `project_task_assignees`, `project_media`, `project_media_recipients`
- **Payments & Wallet**: `wallet_accounts`, `wallet_ledger_entries`, `wallet_balance_snapshots`, `savings_subscriptions`, `savings_installments`, `payments`, `invoices`
- **Partner Incentives**: `partner_incentive_schemes`, `partner_incentive_slabs`, `partner_business_summary`, `partner_commission_ledger`, `partner_points_wallet`, `partner_reward_redemptions`
- **Inventory**: `products`, `product_categories`, `product_brands`, `product_inventory`, `order_items`, `site_orders`

### RLS Policies & Definer Functions
- `can_access_tenant(target_tenant_id)`: Checks if the calling user has an active `tenant_memberships` record for `target_tenant_id`.
- `can_administer_tenant(target_tenant_id)`: Checks if user has admin/owner role in `tenant_memberships` or platform admin status.
- `post_wallet_entry(...)`: `SECURITY DEFINER` function handling atomic wallet balance mutations with `FOR UPDATE` row locks and `external_reference` idempotency checks.
- `process_partner_incentives_for_order_item(...)`: `SECURITY DEFINER` function calculating tier commissions and bonus points upon order item supply.

---

## 4. Key Execution Flows

### 1. Payment Flow
1. Client requests order creation providing business reference/purpose.
2. Server resolves authoritative amount and creates Razorpay order.
3. Client completes payment with Razorpay modal.
4. Server verifies HMAC signature, checks expected amount, currency, and payment state, then records payment.

### 2. Wallet & Accounting Flow
1. Request arrives with `target_tenant_id` and `target_external_reference`.
2. Service verifies tenant access.
3. SQL `post_wallet_entry` checks `target_external_reference` for existing ledger entry.
4. Locks `wallet_accounts` row `FOR UPDATE`, verifies positive ending balance, inserts ledger row, updates account balance, and refreshes snapshot.

### 3. File Upload Flow
1. Client requests presigned upload URL providing filename, MIME type, size, and context.
2. Server validates MIME type and max size limit, sanitizes filename, and generates UUID object key.
3. Client uploads file directly to object storage via presigned URL.
4. Server verifies upload metadata via `HeadObjectCommand` before marking status `ready`.

---

## 5. Security & QA Audit Matrix

| Subsystem | Risk / Issue Identified | Status / Remediation Plan |
| :--- | :--- | :--- |
| **Auth & Tenancy** | Service-role Supabase clients bypass RLS unless tenant access is explicitly asserted in service code. | Assert `tenantAccess.assertTenantAccess()` in every service method before database query. |
| **Payments** | Client-determined amounts in initial payment requests. | Derived authoritative amount server-side; validated order ID, payment ID, amount, currency, status. |
| **Wallet** | Concurrent or duplicate wallet balance entry risk. | Implemented `FOR UPDATE` locking and `external_reference` idempotency checks in SQL and NestJS layer. |
| **File Storage** | Directory traversal via unvalidated file keys or arbitrary bucket listing scans. | Enforced safe filename sanitization, UUID key generation, MIME/size validation, and removed unguided bucket scans. |
| **Inventory** | All tenant members previously had edit capabilities on products. | Introduced `assertInventoryPermission` separating viewing, creating, editing, price changing, stock changing, deleting, importing, and exporting. |
| **Projects** | Adding project members didn't verify tenant membership of target user. | Enforced target user active `tenant_memberships` check prior to adding project member. |
| **API Input** | Potential unexpected payload fields on DTOs. | Configured global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true`. |
| **CI/CD Pipeline** | CI only executed NestJS build and tests. | Expanded `.github/workflows/api-ci.yml` to include typecheck, lint, web build, API build, and full test suite execution. |
