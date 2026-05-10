# Web Enterprise Boundary

The web app now supports a gradual migration from direct Supabase orchestration to a NestJS-first enterprise backend without breaking the current product.

## Goal

Keep the current Next.js app working today while changing its runtime shape so that:

- sensitive commands no longer belong to UI components
- the frontend can call NestJS APIs when available
- Supabase remains the safe fallback during migration

## Current web-side boundary

The web app now has a backend gateway layer under:

- `lib/backend/config.ts`
- `lib/backend/http.ts`
- `lib/backend/modules/auth-gateway.ts`
- `lib/backend/modules/workflow-gateway.ts`
- `lib/backend/modules/fintech-gateway.ts`

## Runtime behavior

1. If `NEXT_PUBLIC_API_BASE_URL` is configured, the web app will try NestJS-style HTTP endpoints first.
2. The gateway attaches the current Supabase Auth bearer token to backend requests.
3. If the backend is not configured or the endpoint is not live yet, the gateway falls back to the current Supabase table/RPC path.

This makes the migration production-safe:

- the UI starts behaving like an enterprise client now
- the backend can be introduced module by module
- existing users are not blocked while NestJS is rolled out

## What already moved behind the boundary

### Auth and tenant context

- profile loading
- tenant membership loading
- active tenant resolution
- tenant switching

### Workflow commands

- customer approval / rejection
- substitute response
- architect review
- site-order transitions
- order-item supply marking
- substitute suggestion
- professional verification

### Fintech commands

- wallet entry posting
- savings installment payment
- wallet account provisioning
- referral reward resolution

## Design rule

Going forward:

- reads may continue using Supabase directly where appropriate
- workflow and financial commands should be added to the backend gateway first
- UI components should not call raw RPCs for sensitive actions

## Planned next step

When the NestJS app is introduced, its first stable modules should match the current web gateways:

- `identity`
- `tenants`
- `workflows`
- `wallet`
- `notifications`

That way the web app can switch from fallback mode to backend-first mode with minimal frontend churn.
