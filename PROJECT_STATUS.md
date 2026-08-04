# Project Details And Progress

Last updated: July 26, 2026

## 1. Project Overview

This project is a full-stack, multi-tenant construction procurement and embedded fintech platform for **Mahalaxmi Electricals**.

Its goal is to become an operating system for:

- electrical procurement
- project workflow management
- supplier operations
- requirement intake and review
- wallet / savings / referral fintech flows
- future SaaS and white-label tenant expansion

The platform supports multiple business roles:

- admin
- customer
- electrician
- architect
- supplier (early support exists)

## 2. Current Tech Stack

### Web app

- Next.js 15
- React 19
- App Router
- Tailwind-based styling and shared UI components

### Backend / API

- NestJS modular API under `apps/api`
- Supabase Auth + Postgres as system of record
- BullMQ / queue scaffolding for background jobs

### Database / Infra

- Supabase Postgres
- Row Level Security (RLS)
- Postgres views and RPCs
- Razorpay for payments
- AWS S3 and Cloudflare R2 compatible storage for uploads
- Redis-backed queue design

### Mobile

- Expo / React Native app under `mobile`

### Shared package

- `packages/core` for shared types, gateways, hooks, lighting utilities, and Supabase helpers

## 3. Repo Structure

- `app/`: Next.js web app
- `components/`: shared UI and role-based page modules
- `lib/`: frontend integrations, backend gateway layer, Supabase helpers, storage helpers
- `apps/api/`: NestJS backend
- `db/`: schema foundations, patches, workflow SQL, fintech SQL, tenant SQL, and rebuild scripts
- `mobile/`: React Native mobile app
- `packages/core/`: shared contracts, types, hooks, gateways
- `docs/`: architecture and product design docs

## 4. Architecture Direction

The project is using a **hybrid architecture**:

- simple and fast reads can still go directly from frontend to Supabase
- complex workflows are being moved behind API boundaries
- the web app has a gateway layer under `lib/backend/**`
- NestJS is being introduced gradually so the app can migrate module by module instead of through a full rewrite

This means the project is in an **active transition from DB/RPC-first flows to API-first orchestration**, while still keeping Supabase/Postgres as the main source of truth.

## 5. Major Product Areas Already Built

Based on the repo structure, docs, and backend modules, the platform already includes work across these areas:

### Procurement and workflow

- catalog and inventory foundations
- site orders and order items
- approval workflows
- substitute suggestion flows
- workflow logs and system events
- tenant-aware workflow orchestration

### Requirement intake

- plain text requirement capture
- file upload requirement intake
- OCR pipeline scaffolding
- extraction, matching, and review stages
- procurement generation from reviewed requirement batches

### Fintech

- wallet module
- payments module
- savings / subscription design foundation
- escrow, fees, and monetization modules
- risk and credit-related modules

### Identity and tenancy

- Supabase auth integration
- tenant membership model
- tenant access service
- multi-tenant architecture groundwork

### Notifications and maintenance

- notifications module
- maintenance task monitoring / workers
- background queue scaffolding

### Additional product capabilities

- lighting visualizer functionality
- product image upload and viewing APIs
- mobile companion experience

## 6. Important Backend Modules Present

Inside `apps/api/src/modules`, these modules already exist:

- `identity`
- `tenants`
- `workflows`
- `wallet`
- `notifications`
- `inventory`
- `maintenance`
- `payments`
- `requirements`
- `monetization`
- `risk`

This is a strong sign that the backend has moved well beyond a basic scaffold and now covers real business domains.

## 7. Database / SQL Progress

The `db/` folder shows substantial schema and migration work already completed, including:

- multi-tenant foundation
- full project rebuild SQL
- order workflow backbone
- fintech foundation and operations patches
- requirement ingestion foundation
- lighting visualizer foundation
- authentication repairs and trigger fixes
- RLS and performance patches
- monetization and risk control patches

This suggests the database layer is one of the most mature parts of the project.

## 8. What Has Been Done Till Now

From the current codebase and recent commit history, these are the major accomplishments so far:

- built a role-based web platform with dynamic routing for different user personas
- created a mobile app that shares backend concepts with the web app
- established Supabase-backed authentication and tenant-aware data architecture
- introduced a backend gateway boundary in the web app for safer API-first migration
- created a modular NestJS backend to gradually take over workflow-heavy logic
- designed and implemented a DB-first order workflow backbone with explicit transitions, logs, and events
- added fintech foundations for wallets, payments, savings, and future credit flows
- implemented file/image upload handling and product image serving
- added lighting visualizer-related shared logic
- built requirement ingestion and review infrastructure, including OCR-related services and workers

## 9. Most Recent Completed Work

Recent commits indicate the latest completed milestones include:

- improved OCR list prefix handling
- added an API test script
- improved the OCR review flow
- extended platform modules
- implemented side-by-side OCR comparison with image zoom and pan
- fixed Cloudflare R2 image handling with a self-healing `view-image` API proxy
- consolidated brand UI and client connections
- fixed customer site creation wizard validation issues
- enabled linking a site to requirement batches
- blocked procurement generation when no linked site exists

## 10. Current Work In Progress

The current working tree shows active, uncommitted progress in the backend test suite:

- modified `apps/api/src/modules/requirements/requirements.service.test.ts`
- new `apps/api/src/common/tenancy/tenant-access.service.test.ts`

From those files, the in-progress work appears to include:

- expanded automated tests for requirement extraction
- tests for OCR queue / manual review fallback behavior
- tests for candidate matching and review-required event publishing
- tests for procurement generation from approved requirement items
- tests for rejecting invalid procurement generation
- new tests for tenant access enforcement and friendly authorization errors

So the project is currently improving **backend correctness and coverage**, especially around:

- requirement processing
- procurement generation
- tenant-scoped access control

## 11. Current Project State

Overall, this project is not at idea stage. It is already a **serious working product foundation** with:

- frontend
- mobile
- backend
- shared package layer
- database architecture
- fintech roadmap implementation
- workflow orchestration
- requirement intelligence pipeline

The clearest current theme is:

- stabilizing the enterprise/backend boundary
- strengthening requirement-to-procurement flows
- improving OCR-assisted intake
- tightening multi-tenant safety through tests and access services

## 12. Suggested Use Of This File

Use this file as the quick project memory for:

- understanding what the platform is
- onboarding a new developer
- resuming work in future sessions
- explaining current progress to a teammate, investor, or stakeholder

## 13. Best Supporting Source Files

If you want deeper project context after this file, start with:

- `README.md`
- `docs/system-design.md`
- `docs/fintech-backend-design.md`
- `docs/multi-tenant-architecture.md`
- `docs/order-workflow-backbone.md`
- `apps/api/README.md`
