# Task: T-120 - Care Reminders (Email + Push, Scheduler)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US7 (Receive and control care reminders)
**Requirement**: FR-020, FR-021, FR-022

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
| `architecture.pattern` | modular_monolith (NestJS module: `notifications`) |
| `architecture.communication` | async (BullMQ repeatable/delayed jobs) |
| `backend.scheduling` | app_scheduler (BullMQ repeatable jobs) |
| `email.transactional_provider` | SMTP behind a `MailPort` (Iranian relay in prod, Mailpit in dev) |
| `code_patterns.data_access` | repository (scoped by `user_id`) |
| `code_patterns.error_handling` | exceptions → RFC7807 |
| `conventions.files` | kebab-case |
| `domain.timezone` | UTC internally; `Asia/Tehran` for user-facing schedule times |

### Domain Rules (from Station 11 — Observability/Notifications, Station 14 — Data Lifecycle)

- **Email is the primary channel; web push is best-effort/secondary** (FCM/VAPID is unreliable from Iran and MUST NOT be the guaranteed path). FR-020 requires both channels on a system-predicted per-plant schedule.
- **MailPort abstraction**: all email goes through a `MailPort` interface; the SMTP adapter uses env config. Never call nodemailer directly from feature code.
- **Templates are admin-configurable (FR-021)**: templates + timing/schedule live in `app_config`/`notification` tables; changes apply to FUTURE notifications with no code deploy. This task consumes that config (admin editing UI is T-140).
- **User opt-out (FR-022)**: respect `users.notif_email_enabled` / `notif_push_enabled`; disabling MUST stop future sends to that user. Check preferences at send time, not just at schedule time.
- **Schedule prediction**: a per-plant watering schedule is derived (e.g., from species care guide); reminders enqueued as delayed/repeatable BullMQ jobs. Idempotent send (a `notification` row per scheduled send; don't double-send on worker retry).
- **Time**: store schedule timestamps in UTC; render/compute local cadence against `Asia/Tehran`.

### API Context (from contracts/openapi.yaml)

```yaml
PATCH /v1/account/notifications → update notif_email_enabled / notif_push_enabled  (prefs; UI in T-121)
# Sending itself is background (no client endpoint). Push subscription registration:
POST  /v1/account/push-subscription → store a web-push subscription (best-effort)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. US7 sends per-plant care reminders (e.g., watering) via email (primary) and web push (best-effort) on a predicted schedule, with admin-configurable templates/timing and per-user on/off control.

### Gate Criteria (from Station 11)

- [ ] Email via `MailPort` (no direct nodemailer in feature code)
- [ ] Push is best-effort/secondary; email is guaranteed
- [ ] Templates + timing read from admin config (no code deploy to change)
- [ ] User opt-out checked at send time; disabling stops future sends
- [ ] Idempotent send (no double-send on retry); UTC storage

---

## 🎯 Objective

Implement the reminder scheduler (BullMQ) and the email (MailPort) + best-effort push delivery pipeline, honoring admin-configured templates/timing and per-user preferences.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/notifications/mail.port.ts` + `smtp-mail.adapter.ts` - MailPort interface + SMTP (nodemailer) adapter
- `backend/src/notifications/push.service.ts` - best-effort web-push (VAPID) sender
- `backend/src/notifications/reminder.scheduler.ts` - derives per-plant schedule; enqueues repeatable/delayed jobs
- `backend/src/notifications/reminder.worker.ts` - renders template, checks prefs, sends via email + push, writes `notification` row
- `backend/src/notifications/notifications.controller.ts` - `PATCH /v1/account/notifications`, `POST /v1/account/push-subscription`
- `backend/src/notifications/notifications.module.ts`
- `backend/src/notifications/reminder.worker.spec.ts` - opt-out stops send; email attempted even if push fails; idempotent

### Files to Update (REQUIRED)

- `.env.example` - `SMTP_HOST/PORT/FROM`, `VAPID_PUBLIC_KEY/PRIVATE_KEY`
- `shared/src/index.ts` - export notification-preference types
- (Module registration is T-127.)

### Code/Logic Requirements

- Depends on T-012 (notification/config schema), T-040 (auth for prefs), T-060 (plants to schedule against).
- Push failure MUST NOT block or fail the email send.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → prefs endpoints registered via T-127
- [ ] **API endpoint** → consumed by the settings UI (T-121)

## ✅ Verification

**Command**: `cd backend && npm test -- notifications reminder`
**Success Criteria**: Tests pass — disabled user gets no send; email sent via MailPort even when push throws; duplicate job runs don't double-send; times stored UTC.

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
