# Task: T-083 - Frontend Billing (Upgrade Modal, Checkout Redirect, Credit Balance)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US4 (Subscription tiers with a unified AI credit system)
**Requirement**: FR-016

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
| `frontend.framework` | nextjs (App Router) |
| `frontend.ui_library` / `styling` | MUI + Emotion, RTL |
| `frontend.state_management` | zustand (modal open/close + selected-plan state) |
| `frontend.data_fetching` | tanstack-query (plans, balance, checkout mutation) |
| `conventions.files` | kebab-case |
| `ui_specs.accessibility` | WCAG AA (modal focus trap, labeled CTAs) |
| Testing | Vitest + Testing Library, colocated, 80% coverage target |

### Domain Rules

- **Live plans only, never hardcoded** (FR-016, SC-006): the upgrade modal MUST render whatever `GET /v1/subscriptions/plans` (from `T-080`) returns at render time — no static/placeholder plan list, no fallback hardcoded prices, even for loading/error states (use skeletons/error messages instead of fake data).
- **No real transaction messaging** (FR-018): checkout copy must not imply a real payment is being processed beyond what the mock gateway does — this is a mock Zarinpal flow; UI copy should say "mock checkout"/"simulated payment" is out of scope for user-facing wording, but the flow itself (redirect → return → poll/refresh) must behave like a real redirect-based checkout so the pattern generalizes to a real gateway later.
- **Redirect result is never trusted client-side** (mirrors `T-081`'s server rule): after the mock checkout redirect returns, the frontend must re-fetch the credit balance/tier from the server (`GET /v1/credits/balance`) rather than assuming success from URL query params alone.
- Persian-only UI; logical CSS properties only; empty/loading/error states are mandatory for every fetched list (plans, balance).

### API Context (consumes `T-080` and `T-081`)

```yaml
# Endpoints this feature calls (already implemented by T-080 / T-081)
GET  /v1/subscriptions/plans   → Plan[] { id, key, monthlyCreditAllowance, priceMinor, currency } (security: [], no auth needed to view plans)
GET  /v1/credits/balance       → CreditBalance { balance, tier } (auth required)
POST /v1/payments/checkout     → body: { planId } → { redirectUrl } (auth required)
# Note: GET /v1/payments/verify is a server-side callback (Zarinpal redirects the
# browser to it); this frontend feature does not call /verify directly — it
# re-fetches /v1/credits/balance after returning from the redirect to reflect the
# outcome, per the "never trust the redirect" rule.
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a unified AI-credit system, subscription tiers (mock Zarinpal), tracking, chat, reminders, and admin. This task builds the user-facing billing surface under `frontend/src/features/billing/`: an upgrade modal that renders live plans, a checkout flow that redirects to (and returns from) the mock Zarinpal gateway, and a credit-balance display used throughout the app.

### Gate Criteria (from Station 09 §9.7.1 UX rule, adapted)

- [ ] Upgrade modal renders `GET /v1/subscriptions/plans` data live — verified by a test that changes the mocked plans response and asserts the modal reflects it
- [ ] Checkout flow: clicking a plan's CTA calls `POST /v1/payments/checkout`, then navigates to the returned `redirectUrl`
- [ ] After returning from the redirect, the app shows an "activating/confirming" state and re-fetches `GET /v1/credits/balance` rather than trusting URL params
- [ ] Credit-balance display shows current balance + tier and updates after a successful upgrade
- [ ] Loading/empty/error states present for both plans and balance fetches

---

## 🎯 Objective

Build the upgrade modal (rendering live plans from `GET /v1/subscriptions/plans`), the mock checkout redirect flow, and a credit-balance display, under `frontend/src/features/billing/`.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/features/billing/api/billing-api.ts` - typed fetch client for `GET /v1/subscriptions/plans`, `GET /v1/credits/balance`, `POST /v1/payments/checkout` (imports `shared/src/schemas/subscription.schema.ts` and `payment.schema.ts` from `T-080`/`T-081`)
- `frontend/src/features/billing/hooks/use-plans.ts` - TanStack Query hook wrapping `GET /v1/subscriptions/plans`
- `frontend/src/features/billing/hooks/use-credit-balance.ts` - TanStack Query hook wrapping `GET /v1/credits/balance`
- `frontend/src/features/billing/hooks/use-checkout.ts` - TanStack Query mutation hook wrapping `POST /v1/payments/checkout`, returning the `redirectUrl` for navigation
- `frontend/src/features/billing/store/billing-store.ts` - zustand store holding upgrade-modal open/closed state and the "returning from checkout" flag (consumed globally by `T-097`'s 402 trigger wiring, but self-contained/testable here)
- `frontend/src/features/billing/components/upgrade-modal.tsx` - modal listing live plans with a purchase CTA per plan; loading/empty/error states; no hardcoded plan data
- `frontend/src/features/billing/components/credit-balance-badge.tsx` - small balance + tier display component
- `frontend/src/features/billing/components/checkout-return-banner.tsx` - "Activating your subscription..." banner shown after returning from the mock redirect, which re-fetches `use-credit-balance` and dismisses once the balance/tier reflects the new plan
- `frontend/src/features/billing/components/upgrade-modal.test.tsx` - Vitest + Testing Library: renders live plans, reacts to changed mocked plans data (proves no hardcoding), handles loading/error, checkout CTA triggers `use-checkout` and navigation
- `frontend/src/features/billing/components/credit-balance-badge.test.tsx` - Vitest + Testing Library: renders balance/tier, loading/error states
- `frontend/src/features/billing/index.ts` - barrel export (`UpgradeModal`, `CreditBalanceBadge`, `CheckoutReturnBanner`, `useBillingStore`, hooks)

### Files to Update

- (This task produces a self-contained feature folder with no global consumers yet. Mounting the modal globally, wiring the 402-triggered auto-open, and adding a nav credit-balance slot are handled by `T-097` — do not touch `frontend/src/app/layout.tsx` or the navigation component here.)

### Code/Logic Requirements

- `UpgradeModal` reads plans via `use-plans` and renders one card per `Plan` (key, monthlyCreditAllowance, priceMinor formatted with Persian numerals/currency per the app's centralized numeral formatter, currency); clicking a plan's CTA calls `use-checkout({ planId })` then `window.location.href = redirectUrl` (or Next.js router equivalent for external redirect).
- `billing-store` exposes `isUpgradeModalOpen`, `openUpgradeModal()`, `closeUpgradeModal()`, and `isReturningFromCheckout` — a plain zustand store with no side effects baked in, so `T-097` can drive `openUpgradeModal()` from a global 402 interceptor without this feature needing to know about that interceptor.
- `CheckoutReturnBanner` triggers a `use-credit-balance` refetch on mount (covers the "just returned from the mock gateway redirect" case) and does not read/trust any `Authority`/`Status` query params itself — those are server-verified only (`T-081`).
- `CreditBalanceBadge` renders `balance` and a localized tier label; shows a loading skeleton while fetching and a neutral fallback (not zero) on error, so a fetch failure never visually implies "zero credits" when the true state is unknown.
- All components use MUI `sx`/Emotion with logical CSS properties; all strings Persian; named exports.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → N/A (frontend-only task; consumes `T-080`/`T-081`)
- [ ] **Frontend page** → Added to app router configuration — _N/A; this is a modal/badge mounted globally by `T-097`, not a standalone route_
- [ ] **Navigation** → Link added to sidebar/nav component — _deferred to `T-097`_
- [ ] **API endpoint** → Frontend store/hook calls this endpoint — done in this task (`use-plans`, `use-credit-balance`, `use-checkout`)
- [ ] **Component** → Rendered by a parent component — _`UpgradeModal`/`CreditBalanceBadge` are mounted globally by `T-097`_

## ✅ Verification

**Command**: `cd frontend && npm test -- billing`
**Success Criteria**: All Vitest/Testing Library tests in `upgrade-modal.test.tsx` and `credit-balance-badge.test.tsx` pass, including: the modal renders whatever the (mocked) `GET /v1/subscriptions/plans` response contains — proving no hardcoded plan data — and the checkout CTA correctly invokes the checkout mutation and navigation.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
