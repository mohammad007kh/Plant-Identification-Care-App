# Task: T-021 - Guest Scan Limit Enforcement

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US1
**Requirement**: FR-006

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
| `architecture.layers` | not layered; feature-module boundaries (`backend/src/modules/guests`) |
| `code_patterns.data_access` | repository |
| `code_patterns.error_handling` | exceptions → RFC7807 `application/problem+json` |
| `code_patterns.validation_approach` | schema (Zod) |
| `database.tenancy_model` | single_tenant; guest activity scoped to an anonymous session until transfer |
| `conventions.files` | kebab-case |
| `conventions.variables` | camelCase |
| `security.rate_limit_scope` | ip (registry) — used for the per-IP daily backstop below |

### Domain Rules

- **Guest scans counted server-side**: the client can never self-report scan count; the server is authoritative (`guest_session.scan_count`).
- **IDs**: `guest_session.id` is a ULID matching the httpOnly `guest-id` cookie value (opaque to the client — do not expose the raw ULID structure as anything meaningful).
- **Cost-bounded shared pool**: because guests are unauthenticated, a single abusive IP must not be able to mint unlimited guest sessions to bypass the 2-scan cap — a per-IP daily backstop is required in addition to the per-session cookie counter.
- **Convert-once**: `guest_session.status` transitions `active → converted` exactly once at registration (T-041 consumes this; do not implement the merge here, only the counter/limit and the cookie-issuing contract T-041 will read).

### API Context (from contracts/)

```yaml
# This task extends the endpoint built in T-020 — no new routes, only guard logic:
POST /v1/scans
  # 403 → Problem (guest scan limit reached → registration wall) — NEW response this task adds
```

Relevant `guest_session` table (data-model.md):
| Column | Type | Notes |
|---|---|---|
| id | ulid PK | matches httpOnly guest-id cookie |
| ip_hash | text | per-IP backstop |
| scan_count | integer | server-authoritative (limit 2) |
| status | enum(active, converted) | |
| converted_to_user_id | ulid FK → user null | convert-once |
| created_at | timestamptz | |

Critical invariant (data-model.md #3): *"Guest scan limit = 2, server-authoritative; all guest scans transfer on registration (zero loss)."*

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification. Unauthenticated visitors get exactly 2 free identifications before a registration wall appears, driving conversion into the account system (US2). This task is the server-side enforcement of that limit, sitting in front of the `POST /v1/scans` endpoint built in T-020.

### Gate Criteria

- [ ] The 2nd guest scan succeeds; the 3rd attempt (same guest session) is rejected with a 403 registration-wall response, never a partial scan.
- [ ] `guest_session.scan_count` is incremented atomically and cannot be bypassed by a client omitting/forging the cookie (server issues and reads the cookie; unrecognized/missing cookie ⇒ a fresh `guest_session` is created, not an unlimited bypass).
- [ ] Per-IP daily backstop caps total new guest sessions from one IP (bounds the shared free-tier AI cost even against cookie-clearing abuse).
- [ ] No scan or credit is consumed when the 403 registration-wall response is returned (aligns with FR-004's "no scan consumed on rejection" pattern, applied here to limit rejection).

---

## 🎯 Objective

Enforce exactly 2 guest scans per guest session via a server-set httpOnly guest-id cookie and a server-side counter, backed by a per-IP daily cap; the 3rd attempt must return a "registration required" (403) response instead of performing the scan.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/modules/guests/guests.module.ts` - NestJS module (not yet imported by `app.module.ts` — deferred to T-037).
- `backend/src/modules/guests/guests.service.ts` - `resolveOrCreateGuestSession(req, res)` (reads/sets the httpOnly `guest-id` cookie; creates a `guest_session` row on first sight), `assertScanAllowed(guestSessionId)` (throws a typed `GuestScanLimitExceededException` when `scan_count >= 2`), `recordScanTaken(guestSessionId)` (atomic increment, e.g. `UPDATE ... SET scan_count = scan_count + 1 WHERE id = $1 AND scan_count < 2 RETURNING scan_count` to avoid a race allowing a 3rd scan under concurrent requests).
- `backend/src/modules/guests/guest-session.repository.ts` - all Drizzle access to `guest_session` (repository pattern).
- `backend/src/modules/guests/ip-scan-backstop.service.ts` - Redis-backed per-IP daily counter (`ip_hash` + date key, TTL 24h) capping total new `guest_session` creations per IP per day; configurable ceiling via `app_config` or an env constant documented in code.
- `backend/src/common/filters/guest-scan-limit.filter.ts` (or extend existing RFC7807 exception filter) - maps `GuestScanLimitExceededException` → HTTP 403 `application/problem+json` with `type: "guest-scan-limit-exceeded"` and a `detail` guiding the client to the registration wall.
- `backend/test/guest-scan-limit.e2e-spec.ts` - Supertest: 1st and 2nd scan succeed and increment the cookie-scoped counter; 3rd scan (same cookie) → 403 with the registration-wall problem body and `scan_count` unchanged at 2; concurrent 3rd/4th requests race-tested to confirm only 2 ever succeed; per-IP backstop test simulating repeated cookie-less requests from one `ip_hash` hitting the daily cap.

### Files to Update (REQUIRED)

- `backend/src/modules/scans/scans.controller.ts` - inject `GuestsService`; for unauthenticated requests, call `resolveOrCreateGuestSession()` then `assertScanAllowed()` before delegating to `ScansService.create()`, and call `recordScanTaken()` only after the scan row is successfully created.
- `backend/src/modules/scans/scans.service.ts` - accept an optional `guestSessionId` alongside `userId` when creating the `scan` row (sets `scan.guest_session_id`, leaves `scan.user_id` null — satisfies the DB `CHECK` that exactly one is set).

### Code/Logic Requirements

- **FR-006**: *"System MUST allow a guest exactly 2 scans before requiring registration; the 3rd attempt MUST present a registration wall instead of scanning."* → enforced entirely server-side; the increment-with-guard query must be atomic (no read-then-write race that could let a 3rd scan through under concurrent requests from the same session).
- Cookie: httpOnly, `SameSite=Lax`, `Secure` in production, no client-readable guest identity beyond the opaque cookie value.
- `ip_hash` MUST be a hash (not raw IP) at rest, consistent with `security.input_sanitization: strict` and avoiding storing raw PII longer than necessary.
- Station Rule: tenancy — `guest_session` rows are never joined against another guest's or user's rows; scoping is always by the session's own `id`.

## 🔌 Wiring Checklist

### Web
- [ ] **Backend route** → Registered in main app/router file *(GuestsModule import deferred to T-037; the guard logic itself is wired directly into T-020's `ScansController` above)*
- [ ] **Frontend page** → Added to app router configuration *(not applicable — backend-only)*
- [ ] **Navigation** → Link added to sidebar/nav component *(not applicable — backend-only)*
- [ ] **API endpoint** → Frontend store/hook calls this endpoint *(the 403 response is handled by T-023's frontend flow, wired in T-037)*
- [ ] **Component** → Rendered by a parent component *(not applicable — backend-only)*

## ✅ Verification

**Command**: `cd backend && npm test -- guest-scan-limit`
**Success Criteria**: `guest-scan-limit.e2e-spec.ts` passes — 2 successful guest scans, 3rd rejected with 403 + unchanged `scan_count`, concurrency race test shows no more than 2 successful scans per session, and per-IP backstop test confirms the daily ceiling is enforced.

### Integration Verification (if wiring items checked)

Not applicable — no wiring items are checked in this task; full end-to-end (cookie issuance visible in the browser) is verified in T-037.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
