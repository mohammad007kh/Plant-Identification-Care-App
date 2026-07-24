# Task: T-082 - Credit Exhaustion Guard (402) & Monthly Credit Reset Job

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US4 (Subscription tiers with a unified AI credit system)
**Requirement**: FR-016, FR-019

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
| `backend.job_queue` | bull (BullMQ) — reset job runs as a scheduled worker |
| `backend.job_durability_semantics` | at_least_once — the reset job's writes must be idempotent |
| `infrastructure.scheduling` | app_scheduler |
| `code_patterns.error_handling` | exceptions → RFC7807 (`402 Payment Required` uses the same envelope) |
| `api.error_format` | rfc7807 |
| `database.tenancy_model` | single_tenant — every ledger write scoped by `user_id` |

### Domain Rules (from Station 10 — Usage Metering + Limits)

- **Enforce server-side, before expensive work** (Station 10 §10.6.1): the credit-exhaustion guard MUST run before any AI action executes — it is a guard/interceptor applied to AI-metered endpoints, not a UI-only check.
- **Standard error response** (Station 10 §10.6.5, adapted to this project's RFC7807 convention instead of a custom `error.code` envelope): on insufficient credit, respond `402 Payment Required` as `application/problem+json`, and the `detail`/extension fields MUST carry the live plans payload (the exact same data `GET /v1/subscriptions/plans` from `T-080` returns) so the frontend upgrade modal (`T-083`) can render immediately without a second round trip.
- **Atomic increment / conditional check** (Station 10 §10.8.2, Pattern A): the guard must check `current balance - cost >= 0` and only then allow the action to proceed to its debit step; this task owns the *check-and-block* (402) path — the actual debit transaction against the ledger is the action endpoint's own responsibility (already true for `scans`/`chat`/`comparison` endpoints built elsewhere), this task's guard sits in front of them.
- **Monthly reset = ledger grant, not a balance overwrite** (`data-model.md`): the reset job writes a new `credit_transaction(type=grant, related_type=monthly_reset)` row per user for their tier's `monthly_credit_allowance` — it never directly sets `user.credit_balance` (that denormalized value is derived from the ledger sum, so writing the grant transaction and recomputing/caching the sum keeps the invariant `credit_balance == SUM(ledger)` intact).
- **Idempotent reset** (`data-model.md`, `job_durability_semantics: at_least_once`): the reset job must not double-grant if it is retried or re-triggered for the same billing cycle for the same user — use a deterministic `idempotency_key` (e.g. `monthly_reset:{userId}:{cycleYearMonth}`) on the `credit_transaction` unique constraint.
- **Admin allowance changes apply on next cycle, not retroactively** (FR-019, Station 10 §10.7.3): the reset job reads the tier's *current* `monthly_credit_allowance` at the moment it runs for that user's cycle — it does not touch already-elapsed cycles. New subscribers get the current allowance immediately upon subscribing (handled by `T-081`'s grant-on-verify path, not this job).

### API Context

```yaml
# This task does not add new routes; it adds a cross-cutting guard applied to
# existing (and future) AI-action endpoints, and a background job.
# Relevant existing/represented AI-action endpoints (guard target, per openapi.yaml):
POST /v1/scans                 → 402 on insufficient credit (contract already documents this)
POST /v1/plants/{id}/photos    → 402 on insufficient credit (comparison; from T-060)
POST /v1/plants/{id}/chat      → 402 on insufficient credit (contract already documents this)

# Consumed for the 402 payload:
GET  /v1/subscriptions/plans   → Plan[] (from T-080) — embedded in the 402 problem+json body
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a unified AI-credit system, subscription tiers (mock Zarinpal), tracking, chat, reminders, and admin. This task builds the cross-cutting guard that blocks any AI action when the caller lacks sufficient credit — returning an RFC7807 `402` carrying the live plans payload so the upgrade modal (`T-083`) can render immediately — plus the recurring job that grants each user's monthly credit allowance on their billing cycle, honoring whatever allowance an admin has currently configured for their tier.

### Gate Criteria (from Station 10 §10.11.3 — Limit Enforcement Checklist, adapted)

- [ ] Guard runs server-side before the AI action executes (never only a UI check)
- [ ] 402 response is `application/problem+json` and includes the live plans payload
- [ ] Insufficient-credit path never partially performs the AI action
- [ ] Monthly reset writes ledger `grant` rows, never overwrites `credit_balance` directly
- [ ] Reset job is idempotent per `(userId, billing cycle)` — safe to retry/re-run
- [ ] Reset job reads the tier's *current* admin-configured allowance at run time

---

## 🎯 Objective

Build a shared guard/interceptor that, when a user has insufficient credit for an AI action, returns HTTP `402` `application/problem+json` carrying the live plans payload (for the upgrade modal) and does not perform the action; plus a monthly credit-reset job that writes `grant` ledger entries per tier allowance and applies admin allowance changes to new/renewing cycles.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/common/guards/credit-check.guard.ts` - `CreditCheckGuard implements CanActivate`: reads the required credit cost for the current route/action (from `app_config` credit-cost-per-action, or a per-decorator metadata value), compares against `CreditsService.getBalance(userId)`, throws an `InsufficientCreditException` if insufficient
- `backend/src/common/exceptions/insufficient-credit.exception.ts` - custom exception mapped by the global RFC7807 filter to `402`, with the live plans list embedded in the problem body (calls `SubscriptionsService.listActivePlans()` from `T-080`)
- `backend/src/common/decorators/credit-cost.decorator.ts` - `@CreditCost('identify' | 'comparison' | 'chat')` method decorator used to annotate guarded routes with which metered action they represent
- `backend/src/jobs/monthly-credit-reset.processor.ts` - BullMQ worker: for each active user due for reset this cycle, writes `credit_transaction(type=grant, related_type=monthly_reset, idempotency_key='monthly_reset:{userId}:{cycleYearMonth}')` for their tier's current `monthly_credit_allowance`, then updates the cached `user.credit_balance`
- `backend/src/jobs/monthly-credit-reset.scheduler.ts` - registers the recurring BullMQ repeatable job (daily tick that enqueues due users, per `infrastructure.scheduling: app_scheduler`)
- `backend/test/credit-exhaustion.e2e-spec.ts` - Supertest: guard blocks a metered action at zero/insufficient balance with `402` + plans payload; action is not performed; guard allows the action when balance is sufficient
- `backend/test/monthly-reset.spec.ts` - Vitest/Supertest: reset grants the tier's current allowance; reset is a no-op (no double grant) if run twice for the same user+cycle; changing a tier's allowance before the next cycle changes what the next reset grants

### Files to Update

- `backend/src/modules/plants/plants.controller.ts` - apply `@UseGuards(CreditCheckGuard)` and `@CreditCost('comparison')` to `POST /v1/plants/:id/photos` (the follow-up-photo/comparison endpoint created in `T-060`, which is the one AI-metered action this task's own task set touches directly)
- `backend/src/modules/credits/credits.service.ts` - add `getBalance(userId)` reuse (added in `T-080`) as the guard's read path, and add a `grantMonthlyReset(userId, tierAllowance, cycleKey)` method used by the reset processor (ledger grant + idempotency key, mirroring the pattern used by `T-081`'s `grantAndSetTier`)

### Code/Logic Requirements

- `CreditCheckGuard` resolves the credit cost for the annotated action from `app_config` (admin-configurable, per FR-027/FR-019 — do not hardcode per-action costs in the guard itself); if `app_config` is unavailable, fail safe by blocking (never silently allow a free action).
- On insufficient credit: guard throws before the controller method body runs — no partial execution of the AI action (spec Edge Case: "Credit exhaustion mid-action... blocked before execution").
- The `402` RFC7807 body's `detail`/extension carries the same `Plan[]` shape as `GET /v1/subscriptions/plans` so the frontend needs no second fetch to render the upgrade modal.
- `monthly-credit-reset.processor.ts` processes users in batches (do not load the entire user table into memory at once); each user's grant is wrapped so a mid-batch failure does not corrupt already-processed users (per-user transaction, at-least-once safe via the idempotency key).
- The reset job must be independently testable without BullMQ's real scheduler (expose the per-user reset logic as a plain function/service method that the processor calls, and that the test file calls directly).

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [x] **Backend route** → Registered in main app/router file — _the guard is applied directly to `plants.controller.ts` in this task (see Files to Update); full cross-module registration of the `payments`/`subscriptions`/`credits` controllers happens in `T-097`_
- [ ] **Frontend page** → N/A (backend-only task)
- [ ] **Navigation** → N/A (backend-only task)
- [ ] **API endpoint** → Frontend store/hook calls this endpoint — _the frontend's global 402 handling is wired in `T-097`, consuming this task's guard output_
- [ ] **Component** → N/A (backend-only task)

## ✅ Verification

**Command**: `cd backend && npm test -- credit-exhaustion monthly-reset`
**Success Criteria**: All Supertest/Vitest cases pass, including: an AI-metered request with insufficient balance returns `402` `application/problem+json` with a non-empty plans array and does not perform the action or debit further credit; the monthly reset grants exactly the tier's current allowance once per user per cycle and is safe to re-run (no double grant) when re-triggered for an already-processed cycle.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
