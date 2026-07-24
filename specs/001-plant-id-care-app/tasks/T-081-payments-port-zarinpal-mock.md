# Task: T-081 - PaymentPort + Zarinpal Mock Adapter (Checkout & Verify)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US4 (Subscription tiers with a unified AI credit system)
**Requirement**: FR-018

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
| `payment.provider` | none (real) / `provider_custom: zarinpal_mock_v1` |
| `payment.abstraction_pattern` | port_adapter — `PaymentPort` interface + `ZarinpalMockAdapter` implementation |
| `payment.event_persistence` | ledger (`payment_event` table) |
| `payment.provider_planned` | `[zarinpal_live, stripe]` — the port MUST NOT bake in Zarinpal-mock-only assumptions that would block adding a real adapter later |
| `integrations.webhook_ingress_contract.signature_verification` | required — for Zarinpal this means: NEVER grant credit off the redirect alone, always re-verify server-to-server via the provider's Verify API |
| `integrations.webhook_ingress_contract.idempotency` | event_id_dedupe (here: `provider_ref` / RefID dedupe) |
| `code_patterns.error_handling` | exceptions → RFC7807 |
| `domain.money_representation` | integer minor units (IRR) |

### Domain Rules (from Station 09 — Billing + Payments + Webhooks)

- **The redirect is never the source of truth** (Station 09 §9.7.1, "Critical rules"): `success_url`/redirect query params are NOT proof of payment. `GET /v1/payments/verify` MUST call the (mocked) Zarinpal Verify API server-to-server before granting anything. This is FR-018 and SC-006's payment-integrity twin — treat it as non-negotiable.
- **Idempotency by provider reference** (Station 09 §9.8.5, adapted from Stripe's `stripeEventId` to Zarinpal's `Authority`/`RefID`): unique constraint on `payment_event.idempotency_key` (derived from `provider_ref`). If verify is called twice for the same `RefID` (browser back-button, retry, replay), the second call MUST NOT grant credit/change tier again — it returns the already-recorded outcome.
- **Snapshot price + allowance at checkout time** (`data-model.md` `payment_event`): `price_snapshot_minor` and `credit_allowance_snapshot` are captured from the chosen `subscription_tier` row at the moment `POST /v1/payments/checkout` is called, not re-read at verify time. This protects against a tier's price/allowance changing between checkout and verify.
- **Atomic grant on verified success** (`data-model.md` critical invariant #5): "Payment credit granted exactly once per `provider_ref` (idempotent), only after server-side verify." The credit grant (ledger `credit_transaction` type=`grant`) and the tier change on `user.subscription_tier_id` MUST happen in a single DB transaction.
- **No real transaction** (FR-018): this is a mock gateway — no real money moves. The `ZarinpalMockAdapter` simulates the Zarinpal request/verify contract shape (Authority, Status, RefID) without calling any real external service.

### API Context (from contracts/openapi.yaml)

```yaml
# Relevant endpoints for this task
POST /v1/payments/checkout   → auth required
                                 body: { planId: uuid }
                                 201 → { redirectUrl: string } (mock redirect; snapshots plan price+allowance into a payment_event, status=initiated)
GET  /v1/payments/verify      → security: [] (Zarinpal callback — the browser is redirected here unauthenticated)
                                 query: Authority (string), Status (string)
                                 200 → verified (re-verify server-to-server; on confirmed success: grant credit + set tier, idempotent by provider_ref)
                                 400 → Problem (verify failed / already-failed / unrecognized Authority)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a unified AI-credit system, subscription tiers (mock Zarinpal), tracking, chat, reminders, and admin. This task implements the payments boundary behind a `PaymentPort` interface with a `ZarinpalMockAdapter` implementation: initiating a mock checkout that snapshots the chosen plan, and a verify callback that re-checks the transaction server-to-server before ever granting credit or changing a user's tier — never trusting client-supplied redirect parameters.

### Gate Criteria (from Station 09 §9.11 — Security Checklist, adapted for mock)

- [ ] `PaymentPort` interface has no Zarinpal-specific types leaking into its signature (future `stripe`/`zarinpal_live` adapters can implement it unchanged)
- [ ] `POST /v1/payments/checkout` snapshots `price_minor` + `monthly_credit_allowance` into `payment_event` at call time
- [ ] `GET /v1/payments/verify` calls the adapter's server-to-server verify method — it never grants credit purely from query params
- [ ] Idempotent by `provider_ref`: calling verify twice for the same `Authority`/`RefID` grants credit at most once
- [ ] Credit grant + tier change happen in one DB transaction
- [ ] No card/payment secrets logged or stored

---

## 🎯 Objective

Implement a `PaymentPort` interface and a `ZarinpalMockAdapter`; `POST /v1/payments/checkout` (snapshot the chosen plan's price + credit allowance into a `payment_event`, return a mock redirect URL); `GET /v1/payments/verify` (the Zarinpal callback — re-verify server-to-server, never trust redirect params; on confirmed success, atomically grant credits + set tier, idempotent by `provider_ref`/RefID).

## 🛠️ Implementation Details

### Files to Create

- `backend/src/modules/payments/ports/payment.port.ts` - `PaymentPort` interface: `initiateCheckout(input): Promise<{ redirectUrl, providerRef }>`, `verify(providerRef): Promise<{ status: 'verified' | 'failed', amountMinor, providerRef }>` — provider-agnostic, no Zarinpal-specific shapes in the interface
- `backend/src/modules/payments/adapters/zarinpal-mock.adapter.ts` - `ZarinpalMockAdapter implements PaymentPort`: simulates Authority generation on checkout and a deterministic (test-controllable) verify outcome; performs no real external HTTP calls
- `backend/src/modules/payments/payments.module.ts` - NestJS module (not yet registered in `AppModule` — that is `T-097`)
- `backend/src/modules/payments/payments.controller.ts` - `POST /v1/payments/checkout`, `GET /v1/payments/verify`
- `backend/src/modules/payments/payments.service.ts` - orchestrates: checkout → snapshot plan → call adapter → persist `payment_event(status=initiated)`; verify → call adapter.verify → on success, transactionally grant credit + set tier + mark `payment_event.status=verified` (idempotent on `provider_ref`)
- `backend/src/modules/payments/payments.repository.ts` - Drizzle repository for `payment_event`, scoped by `user_id` for checkout creation; verify lookup by `provider_ref` (unique)
- `shared/src/schemas/payment.schema.ts` - Zod: `CheckoutRequestSchema { planId }`, `CheckoutResponseSchema { redirectUrl }`
- `backend/test/payments.e2e-spec.ts` - Supertest: checkout snapshots plan data correctly; verify grants credit + tier exactly once; verify called twice with the same `Authority`/`RefID` does not double-grant; verify never trusts a forged/unverified `Status=OK` query param without calling the adapter's server-side verify

### Files to Update

- `backend/src/modules/credits/credits.service.ts` - add a `grantAndSetTier(userId, { amount, tierId, idempotencyKey })` method used by `PaymentsService` on verified success: writes a `credit_transaction(type=grant)` row and updates `user.subscription_tier_id` + denormalized `credit_balance` in one transaction, guarded by the `idempotencyKey` unique constraint
- `shared/src/index.ts` - export the new `payment.schema.ts`

### Code/Logic Requirements

- `PaymentPort.initiateCheckout` and `.verify` are the only two methods the rest of the app depends on — `PaymentsService` must depend on the `PaymentPort` interface (via DI token), not directly on `ZarinpalMockAdapter`, so a real `zarinpal_live`/`stripe` adapter can be substituted later without touching `PaymentsService`.
- `POST /v1/payments/checkout`: looks up the requested `planId` (from `T-080`'s `subscription_tier`), snapshots `price_minor` → `price_snapshot_minor` and `monthly_credit_allowance` → `credit_allowance_snapshot` into a new `payment_event(status=initiated, provider='zarinpal_mock')`, calls `PaymentPort.initiateCheckout`, persists the returned `provider_ref` (Authority), and returns `{ redirectUrl }`.
- `GET /v1/payments/verify`: reads `Authority`/`Status` from the query string for routing only (which `payment_event` to look up) — the actual pass/fail determination comes from calling `PaymentPort.verify(providerRef)`, never from the `Status` query param directly.
- On adapter-verified success: in a single DB transaction, (a) mark `payment_event.status = verified`, (b) call `CreditsService.grantAndSetTier(...)` with `credit_allowance_snapshot` and the target tier, using `payment_event.idempotency_key` (derived from `provider_ref`) as the idempotency guard.
- On adapter-verified failure: mark `payment_event.status = failed`; do not touch credits/tier.
- Re-calling verify for an already-`verified` or already-`failed` `payment_event` returns the stored outcome without re-invoking the grant path (idempotent).
- No real HTTP calls to any external payment provider — the "mock" adapter is fully in-process/deterministic for tests.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → Registered in main app/router file — _deferred to `T-097`, not part of this task_
- [ ] **Frontend page** → N/A (backend-only task)
- [ ] **Navigation** → N/A (backend-only task)
- [ ] **API endpoint** → Frontend store/hook calls this endpoint — _implemented in `T-083`, wired in `T-097`_
- [ ] **Component** → N/A (backend-only task)

## ✅ Verification

**Command**: `cd backend && npm test -- payments`
**Success Criteria**: All Supertest cases in `payments.e2e-spec.ts` pass, including: checkout correctly snapshots plan price/allowance; a completed mock checkout updates the user's subscription tier and grants the snapshotted credit allowance; verify is idempotent (calling it twice for the same `provider_ref` grants credit exactly once); no code path grants credit without calling the adapter's `verify` method first.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
