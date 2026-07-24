# Task: T-127 - Wire US7 (Care Reminders)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US7 (Receive and control care reminders)
**Requirement**: N/A (wiring/integration task for US7)

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
| `architecture.pattern` | modular_monolith (register `NotificationsModule`) |
| `backend.scheduling` | app_scheduler (repeatable BullMQ jobs must be registered) |
| `conventions.files` | kebab-case |

### Domain Rules (from Station 12 — CI/CD & Wiring)

- **UPDATE-only wiring task.** Register `NotificationsModule`, the reminder scheduler (repeatable job), and the worker; add the settings route + nav on the frontend.
- **Confirm the scheduler and worker are attached at boot** — an unregistered scheduler means reminders never fire.

### API Context (from contracts/openapi.yaml)

```yaml
# No new endpoints — wires T-120 (endpoints + scheduler + worker) and T-121 (settings UI).
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task connects US7 so scheduled reminders actually send and users can toggle them in settings.

### Gate Criteria (from Station 12)

- [ ] `NotificationsModule` imported in `app.module.ts`
- [ ] Reminder scheduler (repeatable job) + worker registered at boot
- [ ] Settings page routed and reachable from nav

---

## 🎯 Objective

Register the notifications module, scheduler, and worker in the backend and add the settings route/nav on the frontend.

## 🛠️ Implementation Details

### Files to Create

- (none — wiring task)

### Files to Update (REQUIRED)

- `backend/src/app.module.ts` - import `NotificationsModule`; ensure reminder queue registered
- `backend/src/notifications/notifications.module.ts` - register scheduler (repeatable job) + `ReminderWorker`
- `frontend/src/app/(fa)/settings/page.tsx` - add the settings route mounting notification settings (T-121)
- `frontend/src/components/nav/*` - add a "Settings" nav link

### Code/Logic Requirements

- Depends on T-120, T-121.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → `NotificationsModule` registered; scheduler + worker attached
- [ ] **Frontend page** → `/settings` added to the app router
- [ ] **Navigation** → "Settings" link added
- [ ] **API endpoint** → prefs UI connected to endpoints

## ✅ Verification

**Command**: `curl -s -X PATCH http://localhost:3001/v1/account/notifications -H "authorization: Bearer <test>" -H "content-type: application/json" -d '{"emailEnabled":false}' | jq '.emailEnabled == false'`
**Success Criteria**: Preference update succeeds and persists; the reminder scheduler is registered at boot (no unscheduled reminders); `/settings` renders.

### Integration Verification

```bash
cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
