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

## Product image storage with Amazon S3

Admin product image uploads use Amazon S3 through a server-side Next.js route.

Add these variables to `.env.local`:

```bash
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_S3_BUCKET=your-public-product-bucket
AWS_S3_PUBLIC_BASE_URL=https://your-public-product-bucket.s3.ap-south-1.amazonaws.com
```

Recommended S3 setup:

- create a bucket dedicated to product images
- keep the bucket readable for product image delivery
- use an IAM user with upload access only to that bucket
- keep the AWS keys server-side only in `.env.local`
