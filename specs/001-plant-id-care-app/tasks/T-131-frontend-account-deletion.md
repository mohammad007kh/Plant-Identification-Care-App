# Task: T-131 - Frontend Account Deletion

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US8 (Request account deletion with a grace period)
**Requirement**: FR-023

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
| `frontend.framework` | Next.js App Router (React 18) |
| `frontend.ui_library` | MUI + Emotion (RTL) |
| `frontend.data_fetching` | TanStack Query |
| `conventions.files` | kebab-case |
| `ui_specs.accessibility` | WCAG-AA |

### Domain Rules (from Station 05 — User Flows)

- **Danger action (RTL, Persian)**: "delete account" lives in settings with a confirmation step explaining the 7-day grace and that all data is permanently removed afterward.
- **Pending state**: when the account is `pending_deletion`, show a persistent banner with the scheduled purge date and a prominent "Cancel deletion" action.
- **Cancel restores**: cancelling returns the UI to normal state immediately.
- Do NOT perform the destructive action client-side; it only calls the request/cancel endpoints.

### API Context (from contracts/openapi.yaml)

```yaml
POST   /v1/account/deletion → request (202)      (T-130)
DELETE /v1/account/deletion → cancel (200)       (T-130)
GET    /v1/account          → deletionStatus, deletionRequestedAt  (T-130)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task builds the US8 UI for requesting deletion (with a clear 7-day-grace confirmation) and cancelling a pending deletion.

### Gate Criteria (from Station 05 — User Flows)

- [ ] Confirmation clearly states the 7-day grace + permanence
- [ ] Pending banner shows purge date + Cancel action
- [ ] Cancel restores normal UI
- [ ] RTL, Persian labels via i18n

---

## 🎯 Objective

Build the account-deletion request/confirm UI and the pending-deletion banner with cancel.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/features/account/delete-account.tsx` - danger action + confirm dialog
- `frontend/src/features/account/pending-deletion-banner.tsx` - shows purge date + cancel
- `frontend/src/features/account/use-account-deletion.ts` - request/cancel/status hook
- `frontend/src/features/account/delete-account.test.tsx` - confirm requests; banner cancel restores

### Files to Update (REQUIRED)

- `frontend/src/lib/api/index.ts` - add deletion request/cancel/status calls
- (Route/nav + banner mount into the app shell handled in T-137.)

### Code/Logic Requirements

- Depends on T-130 (endpoints), T-043 (authenticated shell).

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Component** → delete action on settings; banner mounted in app shell (T-137)
- [ ] **API endpoint** → hook connected to deletion endpoints

## ✅ Verification

**Command**: `cd frontend && npm test -- delete-account`
**Success Criteria**: Tests pass — confirming calls the request endpoint; the pending banner renders a purge date and cancel restores normal state.

### Integration Verification

```bash
cd frontend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
