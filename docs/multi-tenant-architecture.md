# Multi-Tenant Architecture For Mahalaxmi Electricals

## Core Decision

Use a **shared-database, shared-schema, row-isolated multi-tenant model** in Supabase/Postgres.

This is the right first step because:

- it lets you upgrade the current single-shop app instead of rebuilding from zero
- it works well with Supabase RLS
- it is operationally simpler than per-tenant databases
- it gives you a clean path to white-label SaaS later

## Recommended Tenant Model

### 1. `users` stay global

Users should remain global identities:

- one Supabase auth account
- one `public.users` profile
- many tenant memberships

This is important because electricians, architects, and even admin operators may eventually work across multiple shops.

### 2. Add `tenants`

Each shop/business becomes a tenant.

For your current app:

- `Mahalaxmi Electricals` becomes the first tenant

For SaaS:

- every other hardware or electrical shop gets its own tenant row

### 3. Add `tenant_memberships`

This is the real access-control table.

It answers:

- which user belongs to which tenant
- what authority they have inside that tenant
- what their default active tenant is

### 4. Add `tenant_branding`

This is where white-label lives:

- app name
- colors
- logo
- support contact
- custom domain/subdomain

### 5. Add `tenant_id` to all operational tables

For your current schema, the most important tables to tenant-scope are:

- `sites`
- `site_assignments`
- `project_bids`
- `product_categories`
- `product_brands`
- `products`
- `site_orders`
- `order_items`
- `order_item_status_history`
- `substitute_suggestions`
- `budget_trackers`
- `finance_applications`
- `content_posts`
- `notifications`
- `audit_logs`
- `product_requests`
- `site_notes`

## Catalog Strategy

For your current stage, the simplest scalable model is:

- keep the existing catalog tables
- add `tenant_id`
- scope all catalog rows to a tenant

That means each shop can have:

- its own categories
- its own brands
- its own product list
- its own pricing
- its own inventory

Later, when you expand nationally, split catalog into:

- global master catalog
- tenant listings / pricing / stock / approval overlays

But right now, **tenant-scoped current tables are the best migration path**.

## RLS Strategy

Use tenant access as the first gate:

- user must belong to tenant
- then row-level business rules apply

Recommended helper functions:

- `current_tenant_id()`
- `current_tenant_ids()`
- `can_access_tenant(tenant_id)`
- `can_administer_tenant(tenant_id)`

Then update site/order logic to check both:

- business relation
- tenant membership

## Views: Keep Or Delete?

### Short answer

**Keep the views. Do not delete them right now.**

### Why they are useful

Your app already relies on them heavily for:

- dashboard projections
- approval queues
- material trackers
- enriched note and product-request feeds

These are good use cases for views because they:

- reduce repeated join logic in frontend code
- keep mobile and web consistent
- make role dashboards easier to build

### The important catch in Supabase

Views are only safe in a multi-tenant app if:

1. underlying tables have correct RLS
2. the views are created with `security_invoker = true`

So the right move is:

- **tenant-scope the base tables**
- **recreate the views as tenant-aware**
- **keep them as read models**

### When to replace a view with an RPC/function

Replace a view only when:

- the query needs tenant-aware parameters
- you need complex branching logic
- performance tuning requires materialized or procedural behavior

## Migration Path From Your Current Single-Shop Schema

### Stage 1. Add tenant foundation

- create `tenants`
- create `tenant_memberships`
- create `tenant_branding`
- create first tenant: `mahalaxmi-electricals`
- backfill all current data into that tenant

### Stage 2. Add `tenant_id` to operational tables

- backfill all existing rows to Mahalaxmi tenant
- set `NOT NULL`
- add tenant indexes
- move global uniques to tenant-scoped uniques

### Stage 3. Add tenant helper functions and RLS

- tenant access helpers
- tenant admin helpers
- tenant-aware `can_access_site()`
- tenant-aware policies on catalog, sites, orders, finance, content, notifications

### Stage 4. Recreate the views

- add `tenant_id` to views
- mark them `security_invoker = true`
- keep frontend API shape stable where possible

### Stage 5. App upgrade

Then we update frontend/backend behavior to:

- choose active tenant
- show tenant branding
- restrict all queries to active tenant
- allow onboarding of new shops

## Recommended Product Shape For SaaS

### Tenant roles

Do not rely only on `users.role` for SaaS authorization.

Keep:

- `users.role` as person/business persona for app workflow

Add:

- `tenant_memberships.role` as authorization inside each shop

Example:

- one user can be `electrician` in persona
- but also `owner` or `admin` inside a specific tenant

## White-Label SaaS Notes

The minimum white-label structure should support:

- `tenant.slug`
- `tenant_branding.app_name`
- `tenant_branding.logo_url`
- `tenant_branding.primary_color`
- `tenant_branding.support_email`
- `tenant_branding.support_phone`
- optional `tenant_branding.custom_domain`

## Immediate Recommendation

Start by running the additive migration in:

- [multi_tenant_foundation.sql](/Users/harshdadriwal/Downloads/App/db/multi_tenant_foundation.sql)

That file is designed to upgrade the current project rather than replace it.
