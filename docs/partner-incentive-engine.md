# Partner Incentive Engine

The Partner Incentive Engine is integrated into the existing Supabase/PostgreSQL, NestJS, Next.js, and Expo app structure. It reuses existing users, product categories, products, site orders, order items, notifications, tenant access, and RBAC helpers.

## Database

Run `db/partner_incentive_engine.sql` after the current project migrations. The same SQL is appended to `db/full_project_rebuild_complete.sql` for fresh rebuilds.

Key additions:

- `product_categories.commission_type`: `WIRE` or `OTHER`, so no product IDs are hardcoded.
- `partner_incentive_schemes`: tenant-scoped configurable schemes by partner type or `all`.
- `partner_incentive_slabs`: dynamic ranges, commission percentages, tier metadata, and bonus points.
- `partner_business_summary`: yearly partner totals and current slab.
- `partner_commission_ledger`: idempotent commission and bonus ledger.
- `partner_points_wallet`: partner points balance when no reusable points wallet exists.
- `partner_reward_redemptions`, `partner_slab_history`, `partner_scheme_history`.

Default seeded slabs store the current business rules in the database: Bronze, Silver, Gold, Platinum, and Diamond with 2% wire commission, 10% other commission, and the requested bonus points.

## Lifecycle Hook

The migration adds `trg_partner_incentive_order_item_supplied` on `order_items`. When an existing order item changes to `supplied`, `process_partner_incentives_for_order_item`:

1. Reads existing order, partner, product, and category data.
2. Finds the active scheme for the partner type, falling back to `all`.
3. Updates yearly business totals.
4. Determines the slab from configured ranges.
5. Writes an idempotent commission ledger entry.
6. Awards tier bonus points once per partner/scheme/slab/year.
7. Records slab history and creates a notification.

## APIs

NestJS module: `apps/api/src/modules/partner-incentives`.

Partner endpoints:

- `GET /api/v1/partner/incentives`
- `GET /api/v1/partner/ledger`
- `GET /api/v1/partner/business`
- `GET /api/v1/partner/progress`

Admin endpoints:

- `GET /api/v1/admin/incentive-schemes`
- `POST /api/v1/admin/incentive-schemes`
- `PUT /api/v1/admin/incentive-schemes/:id`
- `PATCH /api/v1/admin/incentive-schemes/:id`
- `POST /api/v1/admin/incentive-schemes/:id/duplicate`
- `DELETE /api/v1/admin/incentive-schemes/:id`
- `POST /api/v1/admin/slabs`
- `PUT /api/v1/admin/slabs/:id`
- `DELETE /api/v1/admin/slabs/:id`

Admin writes use existing tenant admin checks. Partners only read their own incentive rows through RLS and service filtering.

## UI

- Admin Portal: `Partner Incentives` page added under admin navigation.
- Partner Web: `Partner Incentives` page added for architects and electricians.
- Expo Mobile: `Rewards` tab added for architects and electricians.

The UI supports scheme CRUD, duplication, status changes, slab CRUD, category commission mapping, top partner reports, commission, business, points, tier distribution, current tier, progress, ledger, and bonus history.
