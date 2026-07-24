# Task: T-190 - E2E Tests for Critical Flows

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Final Verification (spans US1, US2, US4)
**Requirement**: FR-001, FR-003, FR-006, FR-008, FR-016, FR-017, FR-018

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
- verify-depth:          light
## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key | Value |
|-----|-------|
| `testing.e2e_framework` | Playwright |
| `testing.mocking` | MSW (mock the AI provider + payment gateway deterministically) |
| `frontend.i18n` | Persian/RTL (selectors must handle RTL + Persian text) |
| `conventions.files` | kebab-case |

### Domain Rules (from Station 12 — CI/CD)

- **Critical journeys only** (per plan): (1) guest scan → identify result (with the <70% low-confidence path); (2) hit the 2-scan guest limit → registration wall → register → prior guest scans carried over; (3) credit exhaustion → 402 → upgrade modal lists live plans; (4) mock Zarinpal checkout → tier/credits updated, no real transaction; (5) AI-failure refund → balance unchanged.
- **Deterministic**: stub the `PlantAIProvider` (confidence values, failure injection) and the `ZarinpalMockAdapter` verify step via MSW/test config — no real OpenAI/network calls in E2E.
- **Runs against the Docker Compose stack** (postgres/redis/minio/mailpit) with a seeded DB.

### API Context (from contracts/openapi.yaml)

```yaml
# Exercises the full stack through the UI; no new endpoints.
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task adds the Playwright E2E suite covering the highest-risk end-to-end journeys — identification, the guest→registered carryover, credit exhaustion + upgrade, mock checkout, and AI-failure refund — so regressions in the money/credit paths are caught before release.

### Gate Criteria (from Station 12)

- [ ] All 5 critical journeys have passing E2E specs
- [ ] AI provider + payment gateway deterministically stubbed
- [ ] Runs green against the seeded Docker Compose stack
- [ ] RTL/Persian-aware selectors

---

## 🎯 Objective

Author Playwright E2E specs for the five critical journeys and get them passing against the seeded local stack with a stubbed AI provider and mock payment gateway.

## 🛠️ Implementation Details

### Files to Create

- `e2e/scan-identify.spec.ts` - guest scan → result + low-confidence path (FR-001, FR-003)
- `e2e/guest-limit-register-carryover.spec.ts` - 2-scan wall → register → carryover (FR-006, FR-008)
- `e2e/credit-exhaustion-upgrade.spec.ts` - 402 → upgrade modal lists live plans (FR-016)
- `e2e/mock-checkout.spec.ts` - Zarinpal-mock checkout updates tier (FR-018)
- `e2e/ai-failure-refund.spec.ts` - AI failure → balance unchanged (FR-017)
- `e2e/fixtures/ai-and-payment-stubs.ts` - deterministic provider/gateway stubs

### Files to Update (REQUIRED)

- `playwright.config.ts` - point at the local stack; global setup seeds/reset
- `package.json` - ensure `test:e2e` runs this suite

### Code/Logic Requirements

- Depends on the wiring tasks: T-037 (US1), T-057 (US2), T-097 (US4). Requires seed (T-004) and Docker Compose (T-001).

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **API endpoint** → E2E drives real endpoints via the UI (stubbed AI/payment only)

## ✅ Verification

**Command**: `npm run test:e2e`
**Success Criteria**: All five critical-journey specs pass green against the seeded local stack.

### Integration Verification

```bash
docker compose up -d && npm run db:migrate && npm run db:seed && npm run test:e2e
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
