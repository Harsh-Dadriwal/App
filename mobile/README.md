# Mahalaxmi Electricals Mobile

This is the Expo mobile app for the same Supabase backend used by the web app.

## What it includes

- Email and phone auth
- Role-aware mobile workspace
- Product catalog browsing
- Mobile-first order builder
- Material tracker
- Project notes
- Admin mobile catalog controls

## Setup

1. Copy `.env.example` to `.env`
2. Add your Supabase project values:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Install dependencies:

```bash
cd /Users/harshdadriwal/Downloads/App/mobile
npm install
```

4. Start Expo:

```bash
npm run dev
```

## Important database note

Run this existing SQL patch on Supabase before using the mobile app:

- `/Users/harshdadriwal/Downloads/App/db/auth_profile_patch.sql`

The mobile auth flow depends on `public.get_my_profile()` for reliable profile loading after login.
