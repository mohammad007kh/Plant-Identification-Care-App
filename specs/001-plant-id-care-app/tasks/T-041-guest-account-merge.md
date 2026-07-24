# Task: T-041 - Guest Session → Account Merge on Registration

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US2
**Requirement**: FR-008

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
| `architecture.pattern` | modular_monolith |
| `architecture.layers` | not layered; extends `backend/src/modules/guests` |
| `code_patterns.data_access` | repository |
| `code_patterns.error_handling` | exceptions → RFC7807 `application/problem+json` |
| `database.tenancy_model` | single_tenant; this task is the exact moment a guest's anonymous data becomes user-owned |
| `conventions.files` | kebab-case |

### Domain Rules

- **Convert-once**: `guest_session.status` transitions `active → converted` exactly once. Re-registration attempts (or replayed requests) against an already-converted session MUST NOT re-merge or double-count scans.
- **Zero scan loss**: every `scan` (and its `photo`) row owned by the guest session at the moment of registration MUST end up owned by the new `user` — this is a hard product guarantee (SC-004: "100% of a guest's session scans are preserved... zero scan loss on conversion").
- **Single transaction, row lock**: the merge (re-parent scans/photos + flip `guest_session.status`) MUST happen in one DB transaction with the `guest_session` row locked `FOR UPDATE`, so a concurrent duplicate registration request (e.g., a double-submit) cannot merge the same session twice or interleave with another merge.
- **IDs**: re-parenting sets `scan.user_id = <new user's ulid>` and clears `scan.guest_session_id` (or leaves it for audit — follow whatever `T-020`'s `scan` schema already defines; do not introduce a new column). Do not change any `public_id`.

### API Context (from contracts/)

```yaml
# No new endpoint — this task extends the existing registration endpoint's behavior:
POST /v1/auth/register
  summary: "Register (email/password). Merges current guest session's scans."
```

Relevant tables (data-model.md):
```
guest_session: id (ulid PK, = guest-id cookie value), status enum(active, converted), converted_to_user_id (ulid FK → user, null until converted)
scan: user_id (ulid FK null), guest_session_id (ulid FK null) — exactly one set (DB CHECK)
```

Critical invariant (data-model.md #3): *"Guest scan limit = 2, server-authoritative; all guest scans transfer on registration (zero loss)."*
Merge note (data-model.md, `guest_session` section): *"Merge: at registration, re-parent owned `scan`/`plant` rows to the new user in one tx; set status=converted (unique guard prevents double-convert)."*

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification and care guidance. When a guest who has already scanned plants creates an account, every scan they performed pre-registration must appear in their new profile — this is the conversion mechanic that makes registering feel free of loss (US2).

### Gate Criteria

- [ ] All `scan` rows for the guest session are re-parented to the new user inside a single transaction with the `guest_session` row locked `FOR UPDATE`.
- [ ] `guest_session.status` becomes `converted` and `converted_to_user_id` is set to the new user's id, atomically with the re-parenting (same transaction).
- [ ] A second merge attempt against an already-`converted` guest session is a no-op (or explicit conflict), never a double re-parent or duplicate scans.
- [ ] The merge runs synchronously as part of the registration request (per the OpenAPI summary), so the registration response reflects the final, merged state — not an eventually-consistent background job.

---

## 🎯 Objective

On registration, re-parent all of the current guest session's scans/photos to the new user in one transaction (locking the guest row `FOR UPDATE`, enforcing convert-once), guaranteeing zero scan loss.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/modules/guests/guest-merge.service.ts` - `mergeGuestSessionIntoUser(guestSessionId, newUserId)`: opens a DB transaction, `SELECT ... FOR UPDATE` the `guest_session` row, verifies `status === 'active'` (else throws a typed `GuestSessionAlreadyConvertedException`, treated as a no-op by the caller — not a hard failure of registration), bulk-updates all `scan` rows (and their `photo` rows, where owned via the scan) to set `user_id = newUserId` and clear `guest_session_id`, sets `guest_session.status = 'converted'` and `converted_to_user_id = newUserId`, commits.
- `backend/test/guest-merge.e2e-spec.ts` - Supertest: guest performs 2 scans (using the guest-id cookie from T-021) → register with that cookie present → response/profile shows both scans linked to the new user; concurrency test firing two simultaneous registration requests with the same guest cookie → exactly one succeeds in merging, the guest session ends up `converted` exactly once, scan count is not doubled; registering with no guest cookie present (never scanned as guest) → registration succeeds with zero scans merged (no error).
- `backend/src/modules/guests/guest-merge.service.spec.ts` - Vitest unit test asserting the transaction re-parents all rows and flips status atomically (mocked/in-memory transaction), including the already-converted no-op path.

### Files to Update (REQUIRED)

- `backend/src/modules/auth/auth.service.ts` - call `GuestMergeService.mergeGuestSessionIntoUser(guestSessionId, user.id)` from the `onUserRegistered` hook point exposed in T-040, passing the guest session id resolved from the incoming request's guest-id cookie (if present); registration MUST still succeed if there is no guest cookie or the session has no scans.
- `backend/src/modules/guests/guests.module.ts` - export `GuestMergeService` so `AuthModule` (T-040) can inject it.
- `backend/src/modules/auth/auth.module.ts` - import `GuestsModule` (or the specific merge provider) to make `GuestMergeService` available for injection.

### Code/Logic Requirements

- **FR-008**: *"Upon registration, System MUST save and link all scans the user performed as a guest in that session to the new account."* → verified end-to-end: after registration, a subsequent authenticated `GET /v1/plants` / scan-history read (once available) must include the pre-registration scans; this task's own test asserts the re-parenting at the data layer directly (querying `scan` rows by the new `user_id`).
- Depends on **T-040** (auth endpoints — provides the registration hook point) and **T-021** (guest scan limit — provides the `guest_session` row and cookie contract being merged).
- The row lock (`FOR UPDATE`) and the convert-once check MUST be inside the same transaction as the re-parent + status flip — no separate "check then act" outside the lock (classic TOCTOU race otherwise).

## 🔌 Wiring Checklist

### Web
- [ ] **Backend route** → Registered in main app/router file *(no new route; this task modifies the behavior behind the existing `/v1/auth/register` route from T-040, itself wired in T-057)*
- [ ] **Frontend page** → Added to app router configuration *(not applicable — backend-only)*
- [ ] **Navigation** → Link added to sidebar/nav component *(not applicable — backend-only)*
- [ ] **API endpoint** → Frontend store/hook calls this endpoint *(not applicable — no new endpoint; consumed implicitly wherever T-043 calls register)*
- [ ] **Component** → Rendered by a parent component *(not applicable — backend-only)*

## ✅ Verification

**Command**: `cd backend && npm test -- guest-merge`
**Success Criteria**: `guest-merge.e2e-spec.ts` passes — 2 pre-registration guest scans both appear owned by the new user post-registration, concurrent double-registration merges exactly once, and registering without any prior guest activity succeeds with zero scans merged.

### Integration Verification (if wiring items checked)

Not applicable — no wiring items are checked in this task.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
