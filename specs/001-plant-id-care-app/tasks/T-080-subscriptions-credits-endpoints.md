# Task: T-080 - Subscriptions Plans & Credits Balance Endpoints

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US4 (Subscription tiers with a unified AI credit system)
**Requirement**: FR-014, FR-016

## Lifecycle Markers

<!--
  Script-managed. Do NOT hand-edit. (v0.3+)
  Populated by scripts/{bash,powershell}/stamp-lifecycle.{sh,ps1}.
  Task files carry BOTH lifecycles: authoring (during /atomicspec.tasks)
  and implementation (during /atomicspec.implement). See Article IX,
  Directive 9 for the Orientation Read Surface that consumes these.
  Optional verify-depth field (light|deep) is set by the authoring AI
  (during /atomicspec.tasks) and obeyed — not re-decided — by the
  resuming AI in Phase 0.
  Empty section = legacy / pre-v0.3 artifact, treated as `legacy_closed`.
-->

---


- Authored start:        2026-07-24T20:15:12Z by claude:opus-4-8
- Authored end:          2026-07-24T20:15:12Z by claude:opus-4-8
- Implementation start:  <empty>
- Implementation end:    <empty>
- verify-depth:          deep
## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key | Value |
|-----|-------|
| `architecture.pattern` | modular_monolith (new `subscriptions` module; extends existing `credits` module) |
| `code_patterns.data_access` | repository — no naked queries |
| `code_patterns.error_handling` | exceptions → RFC7807 |
| `code_patterns.validation_approach` | schema (Zod) |
| `database.tenancy_model` | single_tenant — credits balance scoped by `user_id` |
| `api.pagination` | cursor (not needed here — plans list is small/unpaginated) |
| `domain.money_representation` | integer minor units (IRR) |
| `conventions.files` | kebab-case |

### Domain Rules (from Station 09 — Billing + Payments, and Station 10 — Metering + Limits)

- **Live plans, never hardcoded** (FR-016, SC-006): `GET /v1/subscriptions/plans` MUST read `subscription_tier` rows live from PostgreSQL on every request — no cached/static/hardcoded plan array anywhere in the response path. This is the exact data source the upgrade modal (`T-083`) renders; if this endpoint ever hardcodes plan data, SC-006 ("upgrade modal's listed plans match the admin-configured plans 100% of the time") is violated.
- **Entitlements are versioned config, not code**: per Station 10 §10.4.1, changing a tier's `monthly_credit_allowance` or `price_minor` is an admin data change (via `T-027`/admin config, out of this task's scope), not a deploy. This endpoint must not bake allowance/price values into source.
- **Credit balance invariant** (`data-model.md`): `users.credit_balance == SUM(credit_transaction.amount WHERE user_id)`. `GET /v1/credits/balance` reads the denormalized `user.credit_balance` cache (fast path) alongside the user's current `subscription_tier` — it does not recompute the SUM on every request (that is the reconciliation job's job, not this endpoint's).
- **No naked queries**: both endpoints go through repository methods; the credits balance read is scoped by the authenticated `userId` only (never accepts a `userId` param from the client).

### API Context (from contracts/openapi.yaml)

```yaml
# Relevant endpoints for this task
GET /v1/subscriptions/plans   → security: [] (public — unauthenticated visitors also see plans, e.g. pre-registration)
                                  200 → Plan[] { id: uuid, key: free|pro|max, monthlyCreditAllowance: int, priceMinor: int, currency: string }
GET /v1/credits/balance       → requires bearerAuth
                                  200 → CreditBalance { balance: int, tier: free|pro|max }

# Schemas
Plan: { id: uuid, key: enum(free,pro,max), monthlyCreditAllowance: integer, priceMinor: integer, currency: string }
CreditBalance: { balance: integer, tier: enum(free,pro,max) }
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a unified AI-credit system, subscription tiers (mock Zarinpal), tracking, chat, reminders, and admin. This task delivers the two read endpoints that the upgrade modal and credit-balance display (built in `T-083`) depend on: the live, DB-driven list of subscription tiers/plans, and the authenticated user's current credit balance + tier.

### Gate Criteria (from Station 09 §9.5 / Station 10 §10.4)

- [ ] Plans are read live from `subscription_tier` table — zero hardcoded plan objects in the response path
- [ ] Credits balance is scoped strictly to the authenticated caller (`userId` from JWT, never from request params)
- [ ] Both endpoints return RFC7807 on error
- [ ] `subscription_tier.active` (inactive/retired tiers) is respected — inactive tiers are excluded from the public plans list

---

## 🎯 Objective

Implement `GET /v1/subscriptions/plans` (returns the live subscription tiers from the database — no hardcoded plan data, driving the upgrade modal) and `GET /v1/credits/balance` (returns the authenticated user's current credit balance and tier).

## 🛠️ Implementation Details

### Files to Create

- `backend/src/modules/subscriptions/subscriptions.module.ts` - NestJS module (not yet registered in `AppModule` — that is `T-097`)
- `backend/src/modules/subscriptions/subscriptions.controller.ts` - `GET /v1/subscriptions/plans` (unauthenticated/public per contract `security: []`)
- `backend/src/modules/subscriptions/subscriptions.service.ts` - `listActivePlans()`: reads `subscription_tier` where `active = true`, maps to the `Plan` shape
- `backend/src/modules/subscriptions/subscriptions.repository.ts` - Drizzle repository for `subscription_tier`
- `shared/src/schemas/subscription.schema.ts` - Zod `PlanSchema` (array), shared with frontend `T-083`
- `backend/test/subscriptions.e2e-spec.ts` - Supertest: returns active plans live from DB, excludes inactive tiers, matches `PlanSchema`
- `backend/test/credits-balance.e2e-spec.ts` - Supertest: authenticated balance read, scoped-by-user isolation test (second user gets their own balance/tier, never another user's)

### Files to Update

- `backend/src/modules/credits/credits.controller.ts` - add `GET /v1/credits/balance` handler (the `credits` module itself is assumed to already exist from the `T-015` foundation task — ai-gateway + credits + queues — as the home of debit/refund/ledger logic; this task only adds the read-balance route to it)
- `backend/src/modules/credits/credits.service.ts` - add a `getBalance(userId)` method returning `{ balance: user.credit_balance, tier: user.subscription_tier.key }` (reads the denormalized cache per the invariant above, does not recompute the ledger sum)
- `shared/src/index.ts` - export the new `subscription.schema.ts`

### Code/Logic Requirements

- `GET /v1/subscriptions/plans`: no auth guard (contract `security: []`); filters `active = true`; orders by `price_minor ASC` for a predictable free→pro→max display order; returns `Plan[]` matching the shared Zod schema exactly (field names: `id`, `key`, `monthlyCreditAllowance`, `priceMinor`, `currency`).
- `GET /v1/credits/balance`: requires `bearerAuth`; reads `userId` from the JWT principal (from `T-040`); joins `user` → `subscription_tier` to resolve the current `tier` key; returns `CreditBalance`.
- Both endpoints use the shared Zod schemas for response validation/typing (`code_patterns.validation_approach: schema`).
- Errors (e.g. DB failure) surface through the global RFC7807 exception filter — no hand-rolled error bodies.
- Money values (`priceMinor`) remain integer minor units end-to-end; no floating-point conversion in this task.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → Registered in main app/router file — _deferred to `T-097`, not part of this task_
- [ ] **Frontend page** → N/A (backend-only task)
- [ ] **Navigation** → N/A (backend-only task)
- [ ] **API endpoint** → Frontend store/hook calls this endpoint — _implemented in `T-083`, wired in `T-097`_
- [ ] **Component** → N/A (backend-only task)

## ✅ Verification

**Command**: `cd backend && npm test -- subscriptions credits-balance`
**Success Criteria**: All Supertest cases pass, including: `GET /v1/subscriptions/plans` returns only `active` tiers read live from the DB (a DB-level update to a tier's allowance is reflected on the next call, no restart needed); `GET /v1/credits/balance` returns the correct balance/tier for the authenticated caller and never leaks another user's balance.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
