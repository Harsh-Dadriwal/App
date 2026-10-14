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

## Price list

**Admin → Price List** (and the admin **Price list** shortcut in the mobile app) browses the retail price list exported from Tally: categories, groups and items with MRP, final price, cost price (admins only) and stock. Selecting an item opens a large customer-facing price view. The list is stored in the database and replaced as a whole each time an admin selects **Update from Tally**; it does not change your product catalog.

1. Run `db/price_list.sql` once in the Supabase SQL editor.
2. On the Nest API (`apps/api`), set `PRICE_LIST_DRIVE_FILE_ID` to the Drive file ID of the Tally export and `GOOGLE_SERVICE_ACCOUNT_JSON` to a service account key (single line). Share the Drive file with the service account's `client_email`. `SUPABASE_SERVICE_ROLE_KEY` must also be set, because the price list tables are readable only by the API.
3. Alternatively, leave those two empty and set `GOOGLE_DRIVE_PRODUCTS_URL` to a public direct-download link (`https://drive.google.com/uc?export=download&id=YOUR_FILE_ID`).
4. Restart the API, open **Admin → Price List**, and select **Update from Tally**.

The raw Tally export (UTF-16, `EWSRNO` / `EWCategory` / `EWGroup` / `EWItemName` / `EWMRP` / `EWFINAL` / `EWCOST` / `EWCLSTK` fields) is read as-is. A plain JSON array of stock items (`name`, `parent`, `closingRate`, `closingBalance`, ...) also works. Category images are added from the Categories tab on the web page.

## Complaints & installation requests

Customers raise a complaint or an installation request from **Complaints & Installation** (web) or the dashboard shortcut (mobile). Every active electrician in the workspace gets an in-app notification, sees the request under **Service Requests**, and can offer to take it with an optional message and quote. The customer picks one of the offers. Only the chosen electrician (and admins) see the customer's address and phone number. The electrician then marks the job started and completed, and the customer is notified at each step. Admins see every request under **Admin → Service Requests**.

Setup: run `db/service_requests.sql` once in the Supabase SQL editor and deploy the Nest API. `SUPABASE_SERVICE_ROLE_KEY` must be set on the API, because these tables are readable only through it.

