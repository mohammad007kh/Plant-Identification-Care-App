# Task: T-137 - Wire US8 (Account Deletion)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US8 (Request account deletion with a grace period)
**Requirement**: N/A (wiring/integration task for US8)

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

| Key                    | Value                                        |
| ---------------------- | -------------------------------------------- |
| `architecture.pattern` | modular_monolith (register `AccountModule`)  |
| `backend.scheduling`   | app_scheduler (delayed purge job registered) |
| `conventions.files`    | kebab-case                                   |

### Domain Rules (from Station 12 — CI/CD & Wiring)

- **UPDATE-only wiring task.** Register the account/deletion controller + purge worker; mount the pending-deletion banner in the app shell so it shows across the authenticated UI.
- **Confirm the delayed purge worker is registered at boot** — otherwise deletions never complete.

### API Context (from contracts/openapi.yaml)

```yaml
# No new endpoints — wires T-130 (endpoints + purge worker) and T-131 (UI).
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task connects US8 end-to-end: deletion request/cancel work and the purge job actually runs after the grace window.

### Gate Criteria (from Station 12)

- [ ] `AccountModule` imported in `app.module.ts`
- [ ] Purge BullMQ worker registered at boot
- [ ] Pending-deletion banner mounted in the authenticated shell

---

## 🎯 Objective

Register the account/deletion module + purge worker in the backend and mount the deletion UI + pending banner in the frontend shell.

## 🛠️ Implementation Details

### Files to Create

- (none — wiring task)

### Files to Update (REQUIRED)

- `backend/src/app.module.ts` - import `AccountModule`; ensure purge queue registered
- `backend/src/account/account.module.ts` - register `PurgeWorker`
- `frontend/src/app/(fa)/settings/page.tsx` - mount the delete-account action
- `frontend/src/app/(fa)/layout.tsx` - mount `PendingDeletionBanner` in the authenticated shell

### Code/Logic Requirements

- Depends on T-130, T-131.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [ ] **Backend route** → `AccountModule` registered; purge worker attached
- [ ] **Component** → delete action on settings; banner in shell
- [ ] **API endpoint** → frontend hook connected to deletion endpoints

## ✅ Verification

**Command**: `curl -s -X POST http://localhost:3001/v1/account/deletion -H "authorization: Bearer <test>" -o /dev/null -w "%{http_code}\n"`
**Success Criteria**: Returns `202`; `GET /v1/account` then reports `deletionStatus=pending_deletion`; the purge worker is registered at boot; banner renders in the UI.

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
