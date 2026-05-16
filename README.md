# Mahalaxmi Electricals - Construction Procurement & Fintech Platform

This repository contains the full-stack architecture for a multi-tenant SaaS operating system designed for construction procurement, supplier operations, and embedded fintech workflows.

## 🏗 System Architecture Overview

The platform uses a modern, hybrid data-fetching model. The **Next.js Frontend** connects directly to the **Supabase PostgREST API** for lightning-fast reads and simple writes protected by Row Level Security (RLS). Complex workflows and background tasks are routed through the **NestJS Backend**.

### 1. Frontend: Next.js (App Router)
- **Framework**: React 18 / Next.js 14+ (App Router).
- **Styling**: Tailwind CSS with custom utility classes.
- **Routing**: A catch-all role-based routing architecture (`app/[role]/[[...slug]]/page.tsx`) that dynamically serves localized dashboards for:
  - `admin` (Platform Management)
  - `customer` (Procurement, Fintech, Project Approvals)
  - `electrician` (Job site execution, Material Tracking)
  - `architect` (Lighting Visualization, Product Approvals)
  - `supplier` (Fulfillment Queue, Inventory Management)
- **Data Fetching**: Primarily uses `@supabase/supabase-js` to directly query the database. For secure payment initiation, it uses Next.js server-side API routes (`app/api/*`).

### 2. Database: Supabase Postgres
- **Schema Management**: Managed declaratively via `db/full_project_rebuild.sql` and additive migrations (e.g., `db/supplier_rls_patch.sql`).
- **Security (RLS)**: Row Level Security is heavily utilized. Every query from the frontend is evaluated against the current user's authenticated `role` and `tenant_id` to ensure absolute data isolation.
- **RPCs (Remote Procedure Calls)**: Highly transactional operations (like `mark_order_item_supplied`) are implemented as Postgres Functions to ensure atomic execution and data integrity at the database layer.

### 3. Backend: NestJS API (`apps/api`)
- **Role**: Handles operations that cannot be safely done on the frontend or within simple database queries.
- **Key Modules**:
  - `WorkflowsService`: Executes complex multi-step state transitions and emits Domain Events.
  - `InventoryService`: Handles heavy data aggregation (e.g., calculating 30-day inventory velocity).
  - `QueueService`: Uses Redis + BullMQ to handle background asynchronous tasks (e.g., syncing inventory, generating reports).
- **Hosting**: Deployed as a Dockerized container on Railway.

### 4. Infrastructure Services
- **Authentication**: Supabase Auth (JWT based).
- **Payments**: Razorpay. The Next.js API acts as the secure intermediary to construct orders and verify signatures.
- **Storage**: Cloudflare R2 (S3-compatible API) for blazing fast, cost-effective image and document storage.
- **Caching/Queues**: Redis.

## 🚀 Application Workflow

1. **Onboarding**: Users register and are assigned a default `customer` role. Admin users can verify professionals and elevate their roles to `electrician` or `architect`.
2. **Procurement**: 
   - Customers or professionals request products.
   - Orders are aggregated and pushed to the `Supplier Portal`.
3. **Fulfillment (Supplier Portal)**:
   - Suppliers see approved orders.
   - When a supplier marks an item as "Supplied," the Next.js frontend calls the NestJS API `/workflows/order-items/mark-supplied`.
   - The NestJS API securely executes the Postgres RPC, which deducts from `product_inventory` and updates the order status atomically.
4. **Fintech**: Customers can deposit money into their digital Wallet via Razorpay, allowing for frictionless checkout and Savings Plan installments.

## 💻 Running Locally

### Prerequisites
- Node.js (v18+)
- Postgres Database (Supabase)
- Redis (Optional, for BullMQ)

### Setup
1. Copy `.env.example` to `.env` and fill in your Supabase and Razorpay credentials.
2. Run `npm install` from the root directory.

### Running the Application
- **Frontend Only**: Run `npm run dev` in the root. The app will fetch data directly from Supabase. Payments will work via Next.js API routes.
- **Backend API**: Navigate to `apps/api` and run `npm run start:dev`. Required only for background workflows and specific data aggregations.
