# Task: T-130 - Account Deletion with Grace Period

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
| `architecture.pattern` | modular_monolith (extends `users`/`account` module) |
| `backend.scheduling` | app_scheduler (delayed purge job) |
| `code_patterns.data_access` | repository (scoped by `user_id`) |
| `code_patterns.error_handling` | exceptions → RFC7807 |
| `domain.soft_delete` | targeted soft-delete via `users.deletion_status` for the 7-day grace |
| `conventions.files` | kebab-case |
| `compliance.data_residency` | ir-only (no GDPR scope, but full purge still required) |

### Domain Rules (from Station 14 — Data Lifecycle)

- **Deferred deletion (FR-023)**: request → `deletion_status = pending_deletion`, `deletion_requested_at = now()`; a purge job runs after a 7-day grace.
- **Cancellable during the window**: the user can cancel → `deletion_status = active`, cleared timestamp; cancellation MUST work any time before purge.
- **Complete permanent removal after the window**: purge removes ALL associated data — plants, photos (delete storage objects too), scans, chats, ledger/usage rows, payment events, notifications — then writes a PII-free `deletion_audit` row and sets `deletion_status = purged`.
- **State machine**: `active → pending_deletion → active (cancel) | purged (grace elapsed)`. Purge must be idempotent (re-running on an already-purged user is a no-op).
- **Access during pending**: a `pending_deletion` account can still log in (so it can cancel); surface the pending state.
- **Object storage cleanup**: deleting DB rows is not enough — the purge MUST delete the user's S3 objects by `storage_key`.

### API Context (from contracts/openapi.yaml)

```yaml
POST   /v1/account/deletion  → request deletion (202; sets pending_deletion + requested_at)
DELETE /v1/account/deletion  → cancel a pending deletion (200; back to active)
GET    /v1/account           → includes deletionStatus + deletionRequestedAt
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. US8 lets a user request account deletion, keeps a 7-day cancellable grace window, then permanently and completely purges all their data (DB rows + storage objects) — leaving only a PII-free audit record.

### Gate Criteria (from Station 14 — Data Lifecycle)

- [ ] Request sets `pending_deletion` + timestamp; response explains the 7-day window
- [ ] Cancel restores `active` any time before purge
- [ ] Purge job removes ALL associated data incl. S3 objects
- [ ] Purge is idempotent; writes PII-free `deletion_audit`
- [ ] Purge scheduled exactly 7 days out (UTC)

---

## 🎯 Objective

Implement account-deletion request/cancel endpoints, the 7-day-delayed purge job, and complete data + storage removal with a PII-free audit trail.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/account/deletion.controller.ts` - request / cancel / status
- `backend/src/account/deletion.service.ts` - state transitions, schedules the delayed purge job
- `backend/src/account/purge.worker.ts` - BullMQ delayed job: deletes rows + storage objects, writes `deletion_audit`, sets `purged`
- `backend/src/account/deletion.service.spec.ts` - request→cancel restores; purge removes all data + storage; idempotent

### Files to Update (REQUIRED)

- `shared/src/index.ts` - export `DeletionStatus` type
- (Module registration + frontend are T-137 / T-131.)

### Code/Logic Requirements

- Depends on T-010 (users schema w/ deletion_status), T-012 (deletion_audit), T-040 (auth), T-014/storage service (object deletion).
- Purge worker enumerates the user's `storage_key`s and deletes them via the storage service before deleting `photo` rows.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → deletion controller registered via T-137
- [ ] **API endpoint** → consumed by the account UI (T-131)

## ✅ Verification

**Command**: `cd backend && npm test -- deletion purge`
**Success Criteria**: Tests pass — request sets pending; cancel restores active; simulated purge removes all rows + storage objects, writes audit, and is idempotent on re-run.

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
