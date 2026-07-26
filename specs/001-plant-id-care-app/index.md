# Feature Dashboard: Plant Identification & Care App

**Branch**: `001-plant-id-care-app`
**Spec**: [Link to spec.md](./spec.md)
**Plan**: [Link to plan.md](./plan.md)
**Matrix**: [Link to traceability.md](./traceability.md)

## Lifecycle Markers

<!--
  Script-managed. Do NOT hand-edit. (v0.3+)
  Populated by scripts/{bash,powershell}/stamp-lifecycle.{sh,ps1} during
  /atomicspec.tasks (when index.md is first generated). Authoring lifecycle
  only — index.md is a dashboard, not implemented code. See Article IX,
  Directive 9. Empty section = legacy / pre-v0.3 artifact, treated as
  `legacy_closed`.
-->

- Authored start: 2026-07-24T20:15:36Z by claude:opus-4-8
- Authored end: 2026-07-24T20:15:36Z by claude:opus-4-8

## 📊 Status Overview

| Metric      | Value |
| ----------- | ----- |
| Total Tasks | 47    |
| Completed   | 11    |
| Verified    | 11    |
| Coverage    | 23%   |

## 📚 Knowledge Resources

_Need guidance on specific rules?_

> **[Open the Station Map](../../.specify/knowledge/stations/00-station-map.md)** to find the right rulebook (API, Billing, Auth, etc).

## 🧩 Atomic Task List

### Setup (T-001–T-004)

| ID                                                     | Story | Description                                                    | Status  | Verification                        |
| ------------------------------------------------------ | ----- | -------------------------------------------------------------- | ------- | ----------------------------------- |
| [T-001](./tasks/T-001-scaffold-repo-and-infra.md)      | Setup | Scaffold repo layout + Docker Compose (pg/redis/minio/mailpit) | ✅ Done | `docker compose config -q`          |
| [T-002](./tasks/T-002-backend-nestjs-skeleton.md)      | Setup | NestJS skeleton: /v1 prefix, RFC7807 filter, health            | ✅ Done | `cd backend && npx tsc --noEmit`    |
| [T-003](./tasks/T-003-frontend-nextjs-rtl-skeleton.md) | Setup | Next.js RTL skeleton + MUI theme + Vazirmatn + i18n            | ✅ Done | `cd frontend && npx tsc --noEmit`   |
| [T-004](./tasks/T-004-tooling-testing-seed.md)         | Setup | ESLint/Prettier/tsc, Vitest/Supertest/Playwright, seed         | ✅ Done | `npm run lint && npm run typecheck` |

### Foundation (T-010–T-015)

| ID                                                    | Story      | Description                                                                | Status  | Verification                                              |
| ----------------------------------------------------- | ---------- | -------------------------------------------------------------------------- | ------- | --------------------------------------------------------- |
| [T-010](./tasks/T-010-db-schema-core.md)              | Foundation | Drizzle schema: users, guest_session, plant, species, photo, scan          | ✅ Done | `cd backend && npm run db:generate && npm test -- schema` |
| [T-011](./tasks/T-011-db-schema-credits-billing.md)   | Foundation | Schema: subscription_tier, credit_transaction, usage_record, payment_event | ✅ Done | `cd backend && npm test -- schema-credits`                |
| [T-012](./tasks/T-012-db-schema-support.md)           | Foundation | Schema: chat, comparison, notification, reports, config, analytics, audit  | ✅ Done | `cd backend && npm test -- schema-support`                |
| [T-013](./tasks/T-013-shared-contracts-and-config.md) | Foundation | Shared Zod contracts + app_config service                                  | ✅ Done | `cd shared && npx tsc --noEmit`                           |
| [T-014](./tasks/T-014-upload-validation.md)           | Foundation | Image upload validation + S3 storage adapter                               | ✅ Done | `cd backend && npm test -- upload-validation`             |
| [T-015](./tasks/T-015-ai-gateway-credits-queues.md)   | Foundation | AI gateway (70% gate) + credit ledger + BullMQ                             | ✅ Done | `cd backend && npm test -- credits ai-gateway`            |

### US1 — Identify a plant from a leaf photo (P1) (T-020–T-037)

| ID                                                          | Story | Description                                              | Status  | Verification                                          |
| ----------------------------------------------------------- | ----- | -------------------------------------------------------- | ------- | ----------------------------------------------------- |
| [T-020](./tasks/T-020-scan-identify-endpoints.md)           | US1   | Scan + identify endpoints; identify job; confidence gate | ✅ Done | `cd backend && npm test -- scans`                     |
| [T-021](./tasks/T-021-guest-scan-limit.md)                  | US1   | Guest 2-scan limit (cookie + IP backstop + free pool)    | 🔴 Todo | `cd backend && npm test -- guest-scan-limit`          |
| [T-022](./tasks/T-022-misidentification-report-endpoint.md) | US1   | Misidentification report endpoint                        | 🔴 Todo | `cd backend && npm test -- misidentification-reports` |
| [T-023](./tasks/T-023-frontend-scan-flow.md)                | US1   | Frontend scan flow (upload → result / low-confidence)    | 🔴 Todo | `cd frontend && npm test -- scan`                     |
| [T-037](./tasks/T-037-wire-us1.md)                          | US1   | Wire US1 (routes, nav, api hooks)                        | 🔴 Todo | `curl .../v1/health`                                  |

### US2 — Register after guest limit + keep prior scans (P2) (T-040–T-057)

| ID                                            | Story | Description                                        | Status  | Verification                            |
| --------------------------------------------- | ----- | -------------------------------------------------- | ------- | --------------------------------------- |
| [T-040](./tasks/T-040-auth-jwt-endpoints.md)  | US2   | Auth JWT endpoints (register/login/refresh/logout) | 🔴 Todo | `cd backend && npm test -- auth`        |
| [T-041](./tasks/T-041-guest-account-merge.md) | US2   | Guest→account scan merge (single tx)               | 🔴 Todo | `cd backend && npm test -- guest-merge` |
| [T-043](./tasks/T-043-frontend-auth.md)       | US2   | Frontend auth + registration wall + carryover      | 🔴 Todo | `cd frontend && npm test -- auth`       |
| [T-057](./tasks/T-057-wire-us2.md)            | US2   | Wire US2 (auth routes/guard, auth store, nav)      | 🔴 Todo | `curl .../v1/auth/login`                |

### US3 — Save plants & photo history (P2) (T-060–T-077)

| ID                                         | Story | Description                                  | Status  | Verification                        |
| ------------------------------------------ | ----- | -------------------------------------------- | ------- | ----------------------------------- |
| [T-060](./tasks/T-060-plants-endpoints.md) | US3   | Plants CRUD + photo history (tenancy-scoped) | 🔴 Todo | `cd backend && npm test -- plants`  |
| [T-061](./tasks/T-061-frontend-plants.md)  | US3   | Frontend profile + plant detail              | 🔴 Todo | `cd frontend && npm test -- plants` |
| [T-077](./tasks/T-077-wire-us3.md)         | US3   | Wire US3                                     | 🔴 Todo | `curl .../v1/plants`                |

### US4 — Subscription tiers + unified AI credit system (P2) (T-080–T-097)

| ID                                                        | Story | Description                                     | Status  | Verification                                                |
| --------------------------------------------------------- | ----- | ----------------------------------------------- | ------- | ----------------------------------------------------------- |
| [T-080](./tasks/T-080-subscriptions-credits-endpoints.md) | US4   | Plans (live from DB) + credit balance endpoints | 🔴 Todo | `cd backend && npm test -- subscriptions credits-balance`   |
| [T-081](./tasks/T-081-payments-port-zarinpal-mock.md)     | US4   | PaymentPort + Zarinpal-mock (checkout + verify) | 🔴 Todo | `cd backend && npm test -- payments`                        |
| [T-082](./tasks/T-082-credit-exhaustion-and-reset.md)     | US4   | 402 credit-exhaustion guard + monthly reset job | 🔴 Todo | `cd backend && npm test -- credit-exhaustion monthly-reset` |
| [T-083](./tasks/T-083-frontend-billing.md)                | US4   | Frontend upgrade modal + checkout + balance     | 🔴 Todo | `cd frontend && npm test -- billing`                        |
| [T-097](./tasks/T-097-wire-us4.md)                        | US4   | Wire US4                                        | 🔴 Todo | `curl .../v1/subscriptions/plans`                           |

### US5 — Health comparison (P3) (T-100–T-107)

| ID                                             | Story | Description                              | Status  | Verification                            |
| ---------------------------------------------- | ----- | ---------------------------------------- | ------- | --------------------------------------- |
| [T-100](./tasks/T-100-comparison-endpoints.md) | US5   | Comparison worker + health-trend verdict | 🔴 Todo | `cd backend && npm test -- comparison`  |
| [T-101](./tasks/T-101-frontend-comparison.md)  | US5   | Frontend follow-up upload + trend view   | 🔴 Todo | `cd frontend && npm test -- comparison` |
| [T-107](./tasks/T-107-wire-us5.md)             | US5   | Wire US5                                 | 🔴 Todo | `npm run test:e2e -- --grep comparison` |

### US6 — Plant chat (P3) (T-110–T-117)

| ID                                       | Story | Description                                      | Status  | Verification                      |
| ---------------------------------------- | ----- | ------------------------------------------------ | ------- | --------------------------------- |
| [T-110](./tasks/T-110-chat-endpoints.md) | US6   | Chat endpoints + worker (10-free cap, ≤2 photos) | 🔴 Todo | `cd backend && npm test -- chat`  |
| [T-111](./tasks/T-111-frontend-chat.md)  | US6   | Frontend chat UI (paywall on 402)                | 🔴 Todo | `cd frontend && npm test -- chat` |
| [T-117](./tasks/T-117-wire-us6.md)       | US6   | Wire US6                                         | 🔴 Todo | `curl .../v1/plants/:id/chat`     |

### US7 — Care reminders (P3) (T-120–T-127)

| ID                                                    | Story | Description                                       | Status  | Verification                                       |
| ----------------------------------------------------- | ----- | ------------------------------------------------- | ------- | -------------------------------------------------- |
| [T-120](./tasks/T-120-notifications-scheduler.md)     | US7   | Reminder scheduler + email(MailPort)/push + prefs | 🔴 Todo | `cd backend && npm test -- notifications reminder` |
| [T-121](./tasks/T-121-frontend-notification-prefs.md) | US7   | Frontend notification settings                    | 🔴 Todo | `cd frontend && npm test -- notification-settings` |
| [T-127](./tasks/T-127-wire-us7.md)                    | US7   | Wire US7 (scheduler/worker, settings route)       | 🔴 Todo | `curl .../v1/account/notifications`                |

### US8 — Account deletion (P3) (T-130–T-137)

| ID                                                  | Story | Description                               | Status  | Verification                                |
| --------------------------------------------------- | ----- | ----------------------------------------- | ------- | ------------------------------------------- |
| [T-130](./tasks/T-130-account-deletion.md)          | US8   | Deletion request/cancel + 7-day purge job | 🔴 Todo | `cd backend && npm test -- deletion purge`  |
| [T-131](./tasks/T-131-frontend-account-deletion.md) | US8   | Frontend deletion flow + pending banner   | 🔴 Todo | `cd frontend && npm test -- delete-account` |
| [T-137](./tasks/T-137-wire-us8.md)                  | US8   | Wire US8                                  | 🔴 Todo | `curl .../v1/account/deletion`              |

### US9 — Admin panel (P3) (T-140–T-147)

| ID                                             | Story | Description                                 | Status  | Verification                                                       |
| ---------------------------------------------- | ----- | ------------------------------------------- | ------- | ------------------------------------------------------------------ |
| [T-140](./tasks/T-140-admin-catalog-config.md) | US9   | Admin catalog + live config (behind RBAC)   | 🔴 Todo | `cd backend && npm test -- admin-catalog admin-config admin-guard` |
| [T-141](./tasks/T-141-admin-users-reports.md)  | US9   | Admin user management + report review       | 🔴 Todo | `cd backend && npm test -- admin-users admin-reports`              |
| [T-142](./tasks/T-142-admin-frontend.md)       | US9   | Admin panel frontend                        | 🔴 Todo | `cd frontend && npm test -- admin`                                 |
| [T-147](./tasks/T-147-wire-us9.md)             | US9   | Wire US9 (module + guard, /admin route/nav) | 🔴 Todo | `curl .../v1/admin/species`                                        |

### Cross-cutting (T-160–T-161)

| ID                                             | Story | Description                                       | Status  | Verification                                       |
| ---------------------------------------------- | ----- | ------------------------------------------------- | ------- | -------------------------------------------------- |
| [T-160](./tasks/T-160-analytics-tracking.md)   | Cross | Activity tracking / analytics (FR-028)            | 🔴 Todo | `cd backend && npm test -- analytics`              |
| [T-161](./tasks/T-161-graceful-degradation.md) | Cross | Connectivity/service-failure degradation (FR-030) | 🔴 Todo | `npm test -- error-mapping error-boundary offline` |

### Final Verification (T-190–T-191)

| ID                                                       | Story | Description                        | Status  | Verification         |
| -------------------------------------------------------- | ----- | ---------------------------------- | ------- | -------------------- |
| [T-190](./tasks/T-190-e2e-critical-flows.md)             | Final | Playwright E2E critical flows      | 🔴 Todo | `npm run test:e2e`   |
| [T-191](./tasks/T-191-coverage-and-traceability-gate.md) | Final | Coverage (80%) + traceability gate | 🔴 Todo | `npm run verify:all` |

<!--
  INSTRUCTIONS FOR AI AGENT (CONTEXT PINNING):
  1. This file is your HOME during `/atomicspec.implement`.
  2. Pick the next "Todo" task (respect dependencies — Setup → Foundation → US1 → …).
  3. READ ONLY that task file (e.g., tasks/T-001-scaffold-repo-and-infra.md).
  4. Execute the work.
  5. Verify using the command.
  6. Return here and mark as ✅ Done.
-->
