# Mahalaxmi Electricals — Automated Test Matrix

This document provides a matrix of automated unit, integration, and security tests running across the codebase.

---

## 1. Test Suite Execution Summary

All 74 automated unit and integration tests execute cleanly via Node.js native test runner (`npm run test:api`).

| Test Suite / File | Category | Test Cases Count | Status |
| :--- | :--- | :--- | :--- |
| [`payments.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/payments/payments.service.test.ts) | Payment Security | 2 | **PASSED** |
| [`wallet.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/wallet/wallet.service.test.ts) | Financial Invariants | 7 | **PASSED** |
| [`upload.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/project-media/upload.test.ts) | File Upload Security | 4 | **PASSED** |
| [`projects.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/projects/projects.service.test.ts) | Tenant & Project Access | 2 | **PASSED** |
| [`inventory.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/inventory/inventory.service.test.ts) | Inventory Permissions | 5 | **PASSED** |
| [`partner-incentives.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/partner-incentives/partner-incentives.service.test.ts) | Partner Incentives | 16 | **PASSED** |
| [`validation.pipe.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/common/validation/validation.pipe.test.ts) | API Hardening | 1 | **PASSED** |
| [`tenant-access.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/common/tenancy/tenant-access.service.test.ts) | Tenant Access | 8 | **PASSED** |
| [`credit-engine.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/risk/credit-engine.service.test.ts) | Risk & Credit | 11 | **PASSED** |
| [`requirements.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/requirements/requirements.service.test.ts) | Procurement & OCR | 8 | **PASSED** |
| [`workflows.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/modules/workflows/workflows.service.test.ts) | Order Workflows | 4 | **PASSED** |
| [`firebase-auth.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/common/auth/firebase-auth.service.test.ts) | Authentication | 1 | **PASSED** |
| [`domain-events.service.test.ts`](file:///Users/harshdadriwal/Downloads/App/apps/api/src/common/events/domain-events.service.test.ts) | Event Outbox | 5 | **PASSED** |

**Total Pass Rate**: 74 / 74 tests passed (100%).
