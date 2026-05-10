# Mahalaxmi Electricals Platform System Design

## Purpose

This document is the durable source of truth for the current app architecture.

Use it to explain the platform to:

- another LLM
- a new engineer
- an investor
- a design partner
- yourself in future sessions

Important operational note:

- I cannot guarantee hidden cross-session memory unless a true memory tool is available
- so this file is the reliable system memory for the project
- future architectural changes should be added here

## Product Summary

This is a **multi-role, multi-tenant electrical procurement, project workflow, and fintech platform** built for `Mahalaxmi Electricals`, with a roadmap toward SaaS, marketplace, and credit products.

The platform currently serves:

- customers
- electricians
- architects
- admins
- early supplier role support

It has:

- role-based web workspace
- companion mobile app
- Supabase authentication
- tenant-scoped data model
- catalog and ordering workflows
- approvals and substitutions
- notes and product requests
- wallet, savings, and referral fintech modules
- Razorpay payment flow
- S3-backed product image uploads
- lighting visualizer module for architectural lighting sales
- DB-first order workflow backbone with event history, workflow logs, and transition catalog

## Core Architecture

### Frontend

Two clients exist in the same project:

1. **Web app**
- Next.js App Router
- React
- shared global CSS theme system
- role-driven dynamic route shell under `app/[role]/[[...slug]]`

2. **Mobile app**
- Expo / React Native
- custom lightweight navigation provider
- shared Supabase backend with the web app

### Backend

Backend is built on:

- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security
- Postgres views
- Postgres RPC functions
- explicit order workflow orchestration tables and RPCs
- a web-side backend gateway layer that is ready for gradual NestJS adoption
- a new NestJS-ready backend scaffold under `apps/api`

### Web enterprise boundary

The Next.js app now includes a backend gateway layer under `lib/backend/**`.

This layer gives the web app a production-safe migration path:

- try NestJS-style HTTP APIs first when `NEXT_PUBLIC_API_BASE_URL` is configured
- attach the current Supabase Auth token to backend requests
- fall back to direct Supabase reads/RPCs while backend modules are still being migrated

Sensitive workflow and fintech commands should move through this boundary instead of being called directly from UI components.

### Enterprise backend scaffold

The repo now includes a first backend scaffold at `apps/api` with these modules:

- `identity`
- `tenants`
- `workflows`
- `wallet`
- `notifications`

Current purpose:

- expose API contracts that match the web gateway layer
- wrap the existing Supabase/Postgres/RPC flows
- let the frontend migrate to API-first behavior before deep orchestration is fully extracted from SQL/RPCs

The backend scaffold is intentionally modular-monolith first, so it can later absorb:

- BullMQ queues
- richer workflow orchestration
- ledger-safe fintech services
- supplier and inventory automation

### System workflow layer

The order domain now has a dedicated system layer.

Main tables:

- `system_events`
- `workflow_logs`
- `state_transition_catalog`

Current coverage:

- `order_item`
- `site_order`
- `substitute_suggestion`

Rule:

- business tables store current state
- `system_events` stores what happened
- `workflow_logs` stores how workflow steps executed

### Storage / Payments

- Product images upload to **Amazon S3**
- Razorpay is used for customer payment flows like:
  - wallet top-up
  - savings installment checkout

## Identity Model

### Auth layer

Users are created in:

- `auth.users`

App profiles are created in:

- `public.users`

The signup flow depends on:

- `public.handle_new_auth_user()`
- `on_auth_user_created`
- `public.sync_auth_user_profile()`
- `on_auth_user_updated`

### Public user profile

`public.users` stores:

- app role
- contact details
- verification state
- admin verification state
- tenant preference
- credit fields

Important fields:

- `id`
- `auth_user_id`
- `role`
- `default_tenant_id`
- `verification_status`
- `is_admin_verified`

## Role Model

### App persona role

`users.role` represents the user’s business persona:

- `admin`
- `customer`
- `electrician`
- `architect`
- `supplier` support exists in frontend typing and supplier dashboard plumbing

This role decides which workspace a person sees.

### Tenant role

`tenant_memberships.role` represents authority inside a tenant:

- `owner`
- `admin`
- `staff`
- `customer`
- `electrician`
- `architect`

This is the SaaS authorization layer.

## Multi-Tenant Model

The app uses a **shared-schema, row-isolated multi-tenant model**.

### Main tenant tables

- `tenants`
- `tenant_branding`
- `tenant_memberships`

### Tenant scoping

Operational tables include `tenant_id`, including:

- `sites`
- `site_assignments`
- `project_bids`
- `product_categories`
- `product_brands`
- `products`
- `site_orders`
- `order_items`
- `budget_trackers`
- `finance_applications`
- `content_posts`
- `notifications`
- `product_requests`
- `site_notes`
- fintech tables
- lighting visualizer tables

### Active tenant selection

Each user has:

- `users.default_tenant_id`

The app loads all memberships, then resolves:

- default tenant
- branding
- active membership role

Web and mobile both support tenant switching by updating:

- `users.default_tenant_id`

The order workflow backbone is tenant-scoped too:

- `system_events.tenant_id`
- `workflow_logs.tenant_id`

## Web App Structure

### Shell

The web workspace shell is:

- `components/app-frame.tsx`

It handles:

- sidebar navigation
- tenant switcher
- theme toggle
- notifications
- role workspace chrome
- workflow monitoring panels

### Route model

The main web route entry is:

- `app/[role]/[[...slug]]/page.tsx`

This route dispatches to role-specific page components.

### Major web page groups

- `components/pages/customer-pages.tsx`
- `components/pages/contractor-pages.tsx`
- `components/pages/collaboration-pages.tsx`
- `components/pages/fintech-pages.tsx`
- `components/pages/lighting-pages.tsx`
- `components/order-workflow.tsx`

## Mobile App Structure

### Shell

Mobile root is:

- `mobile/src/mobile-root.tsx`

Navigation is managed by:

- `mobile/src/providers/navigation-provider.tsx`

### Mobile screen groups

- `dashboard-screen.tsx`
- `catalog-screen.tsx`
- `order-builder-screen.tsx`
- `approvals-screen.tsx`
- `materials-screen.tsx`
- `notes-screen.tsx`
- `admin-catalog-screen.tsx`
- `fintech-screen.tsx`
- `lighting-screen.tsx`

### Mobile UX approach

The mobile app is not a clone of the desktop shell.

It is optimized for:

- quick actions
- compact read/write workflows
- field usage
- tap-first product selection
- simplified comparisons and quote capture

## Core Business Modules

### 1. Directory and discovery

Customers can browse:

- electricians
- architects

This is powered by filtered `users` plus professional verification state.

### 2. Project / site management

Sites live in:

- `sites`

They contain:

- address
- project type
- budget
- approval mode
- status
- assignment relationships

### 3. Bidding

Electricians and architects can respond to projects through:

- `project_bids`

### 4. Assignments

Active project participants are stored in:

- `site_assignments`

### 5. Catalog

Catalog hierarchy:

- `product_categories`
- `product_brands`
- `products`
- `product_inventory`

This is tenant-scoped.

Admin can manage category and brand from frontend.

### 6. Ordering and approvals

Order header:

- `site_orders`

Order line items:

- `order_items`

Approval and state transitions include:

- electrician draft
- architect approval
- customer approval
- supply confirmation
- substitute handling
- supply completion

History and substitute logic are supported through:

- `order_item_status_history`
- `substitute_suggestions`

The order system now also has a DB-first orchestration layer:

- `transition_order_item(...)`
- `transition_site_order(...)`
- `start_substitute_workflow(...)`
- `resolve_substitute_workflow(...)`
- `mark_order_supply_progress(...)`

Legacy order RPCs still exist, but they now act as wrappers over the unified transition layer.

Workflow visibility is exposed through:

- `vw_recent_order_workflow_events`
- `vw_order_workflow_timeline`
- `vw_stuck_order_workflows`
- `vw_order_workflow_actor_history`

Current workflow UI surfaces:

- embedded timelines inside customer approvals, architect materials, and admin orders
- dedicated admin workflow center on web
- lightweight mobile timelines for approvals, materials, and order builder

### 7. Notes and collaboration

Project communication is handled through:

- `site_notes`

Product requirement exceptions are handled through:

- `product_requests`

### 8. Content

Educational content is stored in:

- `content_posts`

Categories include:

- electrical tips
- home tips

### 9. Notifications

Notification feed is stored in:

- `notifications`

It is used for:

- approval alerts
- product request updates
- site note events
- substitution flow events

## Fintech System

The fintech layer is **ledger-first**.

### Main fintech tables

Wallet:

- `wallet_accounts`
- `wallet_ledger_entries`
- `wallet_balance_snapshots`

Savings:

- `savings_plan_templates`
- `savings_plan_subscriptions`
- `savings_installments`

Referrals:

- `referral_programs`
- `referral_codes`
- `referral_events`
- `referral_rewards`

Credit:

- user-level fields exist for:
  - `credit_limit`
  - `credit_balance`
  - `credit_score`
- early loan surfaces are present in UI

### Fintech logic

Backend RPCs include workflow operations like:

- create wallet entries
- pay savings installment
- resolve referral rewards

The current frontend supports:

- wallet ledger view
- savings plan enrollment
- installment payment posting
- referral code creation / reward visibility
- admin fintech management

## Razorpay Integration

Razorpay is integrated through:

- `app/api/razorpay/route.ts`

Current flow:

1. frontend requests order creation
2. server creates Razorpay order through REST API
3. checkout opens in browser
4. server verifies payment signature
5. frontend posts wallet or savings mutation after verification

Current payment surfaces:

- wallet top-up
- savings installment payment

## Product Images

Admin product image uploads are handled through:

- `app/api/upload/route.ts`
- `lib/s3.ts`

Images are stored in:

- Amazon S3

Product table stores:

- `products.image_url`

## Lighting Visualizer Module

The newest sales module is the **Architectural Lighting Visualizer**.

### Goal

Help customers and architects understand premium lighting quality visually before ordering or requesting a quote.

### Backend tables

- `lighting_products`
- `leads`

### Product data model

Lighting products store:

- brand
- product name
- SKU
- CRI
- Kelvin
- UGR
- lumens
- summary
- scene badge

### Visual logic

The visual engine simulates lighting using:

- **Kelvin**
  - warm overlay for lower Kelvin
  - cool overlay for higher Kelvin
- **CRI**
  - low CRI adds dullness / flatness
  - high CRI preserves richness
- **UGR**
  - higher glare adds stronger glow
- **Lumens**
  - shifts brightness and vignette

### UI features

Web:

- before/after comparison stage
- product scene cards
- Kelvin slider
- CRI slider
- bilingual CRI / UGR education pills
- quote request form
- admin recent leads view

Mobile:

- same scene model
- before/after mode switching
- tap-based Kelvin and CRI controls
- bilingual education cards
- lead save flow

### Lead capture

Quote requests are stored in:

- `leads`

with:

- tenant
- requester
- product
- room type
- contact info
- scene configuration JSON

## Realtime Strategy

Both web and mobile use Supabase realtime subscriptions for selected tables.

Examples:

- wallet tables
- savings tables
- notifications
- product requests
- lighting products
- lighting leads

Realtime is used mainly for:

- admin monitoring
- wallet updates
- queue freshness

## Views Strategy

The app uses many Postgres views as read models.

Examples:

- `vw_customer_items_on_approval`
- `vw_site_order_item_enriched`
- tracker and dashboard views
- order workflow monitoring views

Views are intentionally kept because they:

- centralize join logic
- keep web and mobile consistent
- simplify role dashboards

In multi-tenant mode, views should stay:

- tenant-aware
- based on RLS-safe tables
- `security_invoker = true` where needed

## Security Model

The app relies on:

- Supabase Auth
- RLS
- helper functions like tenant access checks
- role-aware route rendering

The intended security sequence is:

1. authenticate user
2. resolve profile
3. resolve tenant memberships
4. pick active tenant
5. apply tenant-scoped RLS
6. apply workflow-specific business rules

For orders specifically:

- UI triggers RPCs
- RPCs validate transitions against `state_transition_catalog`
- RPCs update domain rows
- RPCs write `system_events` and `workflow_logs`
- notifications remain downstream effects, not workflow truth

## Current Known Design Tradeoffs

### Styling

The web app currently uses a custom CSS theme system instead of Tailwind.

Reason:

- safer integration with the existing codebase
- lower migration risk
- faster iteration for current product work

### Supplier workflow

Supplier support exists structurally, but is not yet fully expanded into a complete marketplace operating model.

### Credit engine

Wallets, savings, and referrals exist, but full underwriting and lending orchestration are still early-stage.

### Offline mode

Not implemented yet.

### AI assistant layer

Not implemented yet.

## Strategic Direction

This platform is designed to evolve from:

1. operational workflow tool
2. local contractor + customer network
3. tenantized SaaS for other shops
4. fintech layer for savings / referral / credit
5. demand intelligence engine
6. supplier / marketplace network

In simple language:

This app is becoming a **multi-tenant construction-procurement operating system with embedded fintech and premium lighting sales tooling**.

## Files To Read First

If someone new wants to understand the project quickly, start with:

- [system-design.md](/Users/harshdadriwal/Downloads/App/docs/system-design.md)
- [multi-tenant-architecture.md](/Users/harshdadriwal/Downloads/App/docs/multi-tenant-architecture.md)
- [fintech-backend-design.md](/Users/harshdadriwal/Downloads/App/docs/fintech-backend-design.md)
- [order-workflow-backbone.md](/Users/harshdadriwal/Downloads/App/docs/order-workflow-backbone.md)
- [app-frame.tsx](/Users/harshdadriwal/Downloads/App/components/app-frame.tsx)
- [page.tsx](/Users/harshdadriwal/Downloads/App/app/[role]/[[...slug]]/page.tsx)

## Change Rule

Whenever major system changes are made, update this document for:

- new modules
- new tables
- new roles
- new payments / storage / auth behavior
- changed route structure
- changed tenant / RLS assumptions
