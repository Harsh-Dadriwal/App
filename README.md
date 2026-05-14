# Mahalaxmi Electricals App

Responsive Next.js starter connected to Supabase auth patterns for:

- Customer
- Electrician
- Architect
- Admin

## Run

```bash
npm install
cp .env.example .env.local
npm run dev
```

## API scaffold

The repo now also includes a NestJS-ready backend scaffold under:

- `apps/api`

This is the first enterprise migration layer between frontend and Supabase.

Planned runtime pattern:

- web/mobile call NestJS APIs for business actions
- NestJS talks to Supabase Postgres/Auth/Storage/Realtime
- Supabase remains the system of record

When you are ready to bring the backend online:

```bash
cd apps/api
npm install
cp .env.example .env
npm run start:dev
```

Or from the repo root:

```bash
npm run dev:api
```

## Supabase setup

1. Create a Supabase project
2. Copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` into `.env.local`
3. Open the Supabase SQL editor
4. Paste the SQL from:

`db/mahalaxmi_electricals_schema.sql`

If you are continuing from the current app state, also run the additive SQL files:

- `db/collaboration_extensions.sql`
- `db/notification_extensions.sql`
- `db/product_image_extensions.sql`

If you want a single rebuild file for a brand new project, use:

- `db/full_project_rebuild.sql`

## Auth flow

- Email login: email + password
- Email signup: email + password + role
- Phone login: SMS OTP
- Phone signup: SMS OTP + role
- Admin login: supported
- Admin signup: blocked in UI and limited in DB

## Admin cap

The database enforces a maximum of 4 admin accounts.

Recommended pattern:

- Let customers, electricians, and architects self-register
- Promote trusted staff to admin manually in Supabase

Example promotion query:

```sql
update public.users
set role = 'admin',
    is_admin_verified = true,
    verification_status = 'verified'
where email = 'owner@example.com';
```

If 4 admins already exist, the database will reject the change.

## Product image storage with Cloudflare R2

Admin product image uploads use a server-side Next.js route and now prefer Cloudflare R2 to reduce storage cost. The same AWS S3-compatible SDK is used, so R2 works without changing the frontend upload flow.

Add these variables to `.env.local`:

```bash
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=your-product-images-bucket
R2_PUBLIC_BASE_URL=https://cdn.example.com
```

Recommended R2 setup:

- create a bucket dedicated to product images
- front it with a public custom domain or R2 public bucket URL
- create an R2 API token with write access only to that bucket
- keep the R2 keys server-side only in `.env.local`

If you still need a temporary S3 fallback while migrating environments, the app can also read the legacy `AWS_*` variables.
