# Task: T-160 - Activity Tracking & Analytics

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Cross-cutting (spans US1–US9)
**Requirement**: FR-028

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
- Implementation start: 2026-07-26T20:16:18Z by claude
- Implementation end: 2026-07-26T20:16:18Z by claude
- verify-depth: light

## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key                          | Value                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| `architecture.pattern`       | modular_monolith (NestJS module: `analytics`)                      |
| `architecture.communication` | async (fire-and-forget event emission; never blocks the user path) |
| `code_patterns.data_access`  | repository                                                         |
| `error_handling.logging`     | structured JSON logs                                               |
| `analytics.provider`         | self-hosted (`analytics_event` table; external tool deferred)      |
| `conventions.files`          | kebab-case                                                         |

### Domain Rules (from Station 16 — Analytics, Station 11 — Observability)

- **Event coverage (FR-028)**: track at minimum — scan attempts, scan success/failure, confidence scores, registration conversions, subscription tier changes/upgrades, credit consumption, chat usage, and notification delivery/engagement.
- **Non-blocking**: analytics emission MUST NOT block or fail the user action (fire-and-forget; swallow/queue on failure). A tracking failure never breaks a scan or a payment.
- **Privacy**: store event data minimized (user id reference, event type, numeric props, timestamp UTC) — no photo contents, no PII in event payloads.
- **Single emit point**: expose an `AnalyticsService.track(event, props)` used across modules via an event emitter/interceptor so feature code stays clean; persist to `analytics_event` (T-012).

### API Context (from contracts/openapi.yaml)

```yaml
# No public endpoint — internal service consumed across modules.
# (Admin-facing metrics views, if any, are out of scope for v1.)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This cross-cutting task adds product activity tracking — the funnel and usage signals (scans, conversions, upgrades, credit use, chat, notifications) needed to run the business — emitted non-blockingly across all features.

### Gate Criteria (from Station 16)

- [ ] All FR-028 event types emitted from their source flows
- [ ] Emission is non-blocking (failure never breaks the user action)
- [ ] Event payloads minimized (no PII / no photo bytes), UTC timestamps
- [ ] Single `AnalyticsService.track` entry point

---

## 🎯 Objective

Add a non-blocking analytics service and wire event emission for all FR-028 activity types across the existing feature modules.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/analytics/analytics.service.ts` - `track(event, props)`, persists to `analytics_event`
- `backend/src/analytics/analytics.module.ts`
- `backend/src/analytics/analytics.service.spec.ts` - non-blocking behavior + payload minimization

### Files to Update (REQUIRED)

- `backend/src/app.module.ts` - import `AnalyticsModule` (global)
- `backend/src/ai-gateway/ai-gateway.service.ts` - emit scan attempt/success/failure + confidence + credit consumption + chat usage
- `backend/src/auth/*` - emit registration conversion (incl. guest→user)
- `backend/src/payments/*` - emit tier change/upgrade
- `backend/src/notifications/reminder.worker.ts` - emit delivery/engagement

### Code/Logic Requirements

- Depends on T-012 (analytics_event), T-015 (AI gateway), T-040/T-041 (auth), T-081 (payments), T-120 (notifications).
- Prefer an interceptor/event emitter so feature code calls one method; failures are logged and swallowed.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [ ] **New service** → `AnalyticsModule` registered globally in `app.module.ts`
- [ ] **Component** → track() calls added at each FR-028 source flow

## ✅ Verification

**Command**: `cd backend && npm test -- analytics`
**Success Criteria**: Tests pass — each FR-028 event type is emitted from its flow; a forced tracking failure does NOT fail the underlying action; payloads contain no PII/photo data.

### Integration Verification

```bash
cd backend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
