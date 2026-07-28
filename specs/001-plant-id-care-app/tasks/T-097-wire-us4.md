# Task: T-097 - Wire US4 (Subscriptions/Payments/Credits: Module Registration, 402 Trigger, Nav)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US4 (Subscription tiers with a unified AI credit system)
**Requirement**: N/A (wiring)

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

- Authored start: 2026-07-24T20:15:12Z by claude:opus-4-8
- Authored end: 2026-07-24T20:15:12Z by claude:opus-4-8
- Implementation start: 2026-07-28T14:14:05Z by claude
- Implementation end: 2026-07-28T14:14:05Z by claude
- verify-depth: deep

## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key                         | Value                                                      |
| --------------------------- | ---------------------------------------------------------- |
| `architecture.pattern`      | modular_monolith — `AppModule` imports each feature module |
| `frontend.framework`        | nextjs (App Router)                                        |
| `frontend.state_management` | zustand                                                    |
| `frontend.data_fetching`    | tanstack-query                                             |
| `api.error_format`          | rfc7807                                                    |
| `conventions.files`         | kebab-case                                                 |

### Domain Rules

- Pure integration/wiring task: connects code already built by `T-080` (subscriptions + credits-balance endpoints), `T-081` (payments/Zarinpal-mock), `T-082` (credit-check guard + monthly reset job), and `T-083` (frontend billing components) into the running application. No new business logic here.
- **Global 402 handling is the centerpiece of this task**: per FR-016, whenever _any_ AI-metered endpoint (scans, plants photo-comparison, chat) responds `402` (thanks to `T-082`'s guard), the frontend must open the upgrade modal built in `T-083` — this must be wired once, globally, at the HTTP client level, not duplicated per-feature/per-call-site.
- **Orphan-code rule**: `SubscriptionsModule`, `PaymentsModule`, and the `T-082` guard/job exist in code after their respective tasks but are inert until registered here.

### API Context

```yaml
# Endpoints being wired into the running app (implemented in T-080 / T-081)
GET  /v1/subscriptions/plans
GET  /v1/credits/balance
POST /v1/payments/checkout
GET  /v1/payments/verify

# Any endpoint guarded by T-082's CreditCheckGuard can now return:
402 → application/problem+json { ...Problem, plans: Plan[] }
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a unified AI-credit system, subscription tiers (mock Zarinpal), tracking, chat, reminders, and admin. This task closes the loop for US4: registering the `subscriptions`, `payments`, and `credits` controllers/modules in the backend `AppModule`, wiring the frontend billing store so a global HTTP response interceptor opens the upgrade modal automatically on any `402`, adding a credit-balance display to the navigation, and enabling `T-082`'s monthly-reset job scheduler at app bootstrap.

### Gate Criteria

- [ ] `SubscriptionsModule` and `PaymentsModule` appear in `AppModule.imports`; `GET /v1/subscriptions/plans` and `POST /v1/payments/checkout` are reachable over HTTP
- [ ] The monthly-reset job scheduler (from `T-082`) is registered at bootstrap (not just defined in code)
- [ ] A `402` response from any guarded endpoint automatically opens `UpgradeModal` (from `T-083`) via a single global interceptor — not per-feature handling
- [ ] Navigation shows the credit-balance badge for authenticated users
- [ ] No new business logic introduced (wiring only)

---

## 🎯 Objective

Register the subscriptions/payments/credits controllers in the backend `AppModule`; wire the frontend billing store, trigger the upgrade modal automatically on `402` responses, add the credit-balance badge to navigation, and enable the monthly credit-reset job scheduler at bootstrap.

## 🛠️ Implementation Details

### Files to Create

- (No new feature files — this task only registers and connects existing code from `T-080`, `T-081`, `T-082`, `T-083`.)

### Files to Update

- `backend/src/app.module.ts` - import `SubscriptionsModule` (from `T-080`) and `PaymentsModule` (from `T-081`) into the root module's `imports` array (the `CreditsModule` is assumed already registered by the `T-015` foundation task; if not, register it here too)
- `backend/src/main.ts` (or the app's existing bootstrap/worker-registration file) - ensure the `monthly-credit-reset.scheduler.ts` (from `T-082`) is instantiated/started at process bootstrap alongside the app's other BullMQ workers
- `frontend/src/lib/api/http-client.ts` (the app's shared fetch/HTTP client wrapper) - add a global response interceptor: on any `402` `application/problem+json` response, parse the embedded `plans` payload, call `useBillingStore.getState().openUpgradeModal(plans)` (from `T-083`), and surface the retry-eligible error to the caller so the calling feature (scans/chat/plants) can decide not to proceed
- `frontend/src/app/layout.tsx` (or the app's existing root providers/layout file) - mount `<UpgradeModal />` (from `T-083`) once at the root so it is available regardless of which page triggered the `402`
- `frontend/src/components/navigation.tsx` (or the app's existing primary nav component) - add `<CreditBalanceBadge />` (from `T-083`) for authenticated users, alongside an "ارتقا" (Upgrade) link that calls `openUpgradeModal()` directly

### Code/Logic Requirements

- `AppModule` import changes must not alter existing module ordering/behavior beyond adding `SubscriptionsModule`/`PaymentsModule` (and `CreditsModule` only if genuinely missing).
- The global HTTP interceptor is the _only_ place that inspects response status `402` for the upgrade-modal trigger — no individual feature (scans, chat, plants) should special-case `402` itself; they only need to handle the rejected promise/thrown error to stop their own optimistic UI, per the interceptor's re-thrown error.
- Interceptor must not swallow the `402` — after opening the modal, it re-throws/rejects so the calling mutation's own error state (e.g. a disabled "submit" button) still reflects that the action did not complete.
- The monthly-reset scheduler registration must not run duplicate schedules if `main.ts` is invoked multiple times in tests (guard with the existing app bootstrap pattern already used for other BullMQ workers — do not invent a new one).
- No changes to `T-080`/`T-081`/`T-082`/`T-083` internal logic — if wiring reveals a defect in one of those, that is a signal the dependency task was incomplete, not an invitation to patch it here.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [x] **Backend route** → Registered in main app/router file (`backend/src/app.module.ts` imports `SubscriptionsModule`, `PaymentsModule`)
- [x] **Frontend page** → N/A for a route, but the modal is mounted globally in `frontend/src/app/layout.tsx`
- [x] **Navigation** → Credit-balance badge + upgrade link added to nav component
- [x] **API endpoint** → Frontend store/hook calls this endpoint (global interceptor now drives `T-083`'s hooks/modal on every guarded call)
- [x] **Component** → Rendered by a parent component (`UpgradeModal` rendered at root layout)

## ✅ Verification

**Command**: `curl -s http://localhost:3001/v1/subscriptions/plans | jq 'length >= 3'`
**Success Criteria**: Command prints `true` (at least the Free/Pro/Max tiers are live and reachable), confirming `SubscriptionsModule` is registered and serving from the database.

### Integration Verification (if wiring items checked)

```bash
# Verify the subscriptions route is registered and reachable, returning >= 3 live plans
curl -s http://localhost:3001/v1/subscriptions/plans | jq 'length >= 3'
# Expect: true

# Verify the payments checkout route is registered
curl -s -X POST http://localhost:3001/v1/payments/checkout \
  -H 'authorization: Bearer <test>' -H 'content-type: application/json' \
  -d '{"planId":"<test-plan-id>"}' | jq 'has("redirectUrl")'
# Expect: true

# Verify the upgrade modal opens automatically on a 402 (Playwright)
npx playwright test --grep "upgrade modal on credit exhaustion"
# Expect: test drives an authenticated user with zero credit through an AI action,
# asserts the request returns 402, and asserts the UpgradeModal becomes visible
# without any feature-specific handling in the triggering page.
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
