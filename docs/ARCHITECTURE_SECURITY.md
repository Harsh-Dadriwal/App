# Mahalaxmi Electricals — Architecture & Security Reference

This document provides a security architecture reference for tenant isolation, authentication, authorization, payment execution, wallet transaction invariants, file upload security, and API boundary controls.

---

## 1. Security Architecture Diagram

```mermaid
graph TD
  subgraph Client Layer
    WebClient[Next.js Web Portal]
    MobileApp[React Native Mobile]
  end

  subgraph API & Gateway Layer
    ValidationPipe[Global ValidationPipe (whitelist: true)]
    SupabaseAuthGuard[Supabase JWT Auth Guard]
    TenantAccessService[TenantAccessService Isolation Guard]
    RolePermissionCheck[Role & Permission Assertion]
  end

  subgraph Subsystem Engine
    PaymentEngine[Payment Engine (Razorpay HMAC Verification)]
    WalletEngine[Wallet Ledger Engine (FOR UPDATE Locks & Idempotency)]
    MediaEngine[Media Engine (S3 / R2 Signed URLs & Presign Validation)]
    IncentiveEngine[Partner Incentive Engine (Deterministic Slab Calculation)]
  end

  subgraph Storage & Database Layer
    PostgresDB[(Supabase PostgreSQL + RLS)]
    R2Bucket[(Cloudflare R2 Object Bucket)]
  end

  Client Layer --> ValidationPipe
  ValidationPipe --> SupabaseAuthGuard
  SupabaseAuthGuard --> TenantAccessService
  TenantAccessService --> RolePermissionCheck
  RolePermissionCheck --> Subsystem Engine
  PaymentEngine --> PostgresDB
  WalletEngine --> PostgresDB
  IncentiveEngine --> PostgresDB
  MediaEngine --> R2Bucket
```

---

## 2. Invariants & Security Principles

1. **Tenant Isolation Invariant**: No query or update shall read, write, or mutate records across tenant boundaries. Every query executed via `SupabaseAdminService` must first assert tenant membership via `tenantAccess.assertTenantAccess(actor, tenantId)`.
2. **Financial Amount Invariant**: Client applications shall never dictate payment amounts, wallet credit balances, or discount percentages. All financial values are resolved server-side from authoritative business records.
3. **Wallet Balance Invariant**: $AvailableBalance = \sum PostedCredits - \sum PostedDebits$. A wallet debit shall fail if $AvailableBalance < DebitAmount$. Duplicate requests with the same `external_reference` shall return the existing ledger record without double-crediting or double-debiting.
4. **File Storage Security Invariant**: Filenames from clients shall be sanitized. Object keys shall be server-generated with random UUIDs (`uploads/timestamp-uuid.ext`). Client-supplied keys containing directory traversal (`..`, `\0`) shall be rejected with `400 Bad Request`.
5. **API Contract Invariant**: API payloads shall be validated against strict DTOs. Unexpected parameters shall be forbidden (`forbidNonWhitelisted: true`). Raw database stack traces shall be caught and mapped to safe HTTP error responses.
