# Task: T-040 - Auth Endpoints (Register/Login/Refresh/Logout, JWT)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US2
**Requirement**: FR-007

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
| `architecture.pattern` | modular_monolith |
| `architecture.layers` | not layered; feature-module boundaries (`backend/src/modules/auth`) |
| `code_patterns.data_access` | repository |
| `code_patterns.error_handling` | exceptions → RFC7807 `application/problem+json` |
| `code_patterns.validation_approach` | schema (Zod) |
| `database.tenancy_model` | single_tenant |
| `conventions.files` | kebab-case |
| `conventions.variables` | camelCase |
| `security.password_policy` | strong |
| `security.csrf` | token |

### Domain Rules

- **Auth = JWT (registry deviation, founder-approved)**: short-lived access token (Bearer) + rotating httpOnly refresh token cookie + **server-side denylist** for revocation. This is a documented deviation from the registry's default `session` auth — do not "fix" it back to sessions.
- **IDs**: ULID PK + opaque UUID `public_id` — never put the internal `user.id` (ULID) in the JWT `sub` claim or any response body; use `public_id`.
- **Password hashing**: argon2id (per `data-model.md`'s `user.password_hash` column note), never bcrypt/plain.
- **Provider-extensible**: FR-007 explicitly requires the auth layer to admit an additional login provider (e.g., Google) later without a rebuild — structure the module so a second `AuthStrategy` can be added without touching `register`/`login` core logic (e.g., isolate credential verification behind a small interface).
- **Guest merge hook point**: registration is where T-041's guest-scan merge happens — this task must provide a clean extension point (e.g., an injectable hook/service called after the `user` row is created, before the response is sent) without implementing the merge itself.

### API Context (from contracts/)

```yaml
# Relevant endpoints for this task (specs/001-plant-id-care-app/contracts/openapi.yaml)
POST /v1/auth/register   # security: [] — email/password. "Merges current guest session's scans." (hook point for T-041)
                          # 201 created, 409 → Problem (email already registered)
POST /v1/auth/login      # security: [] — 200 ok, 401 → Problem
POST /v1/auth/refresh    # security: [] — rotate refresh token (httpOnly cookie) → new access token; 200 ok, 401 → Problem
POST /v1/auth/logout     # revoke refresh token (denylist); 204 no content
```

Relevant `user` table columns (data-model.md): `id` (ulid), `public_id` (uuid), `email` (citext, unique), `password_hash` (argon2id), `role` (enum user, admin), `created_at`/`updated_at`.

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification and care guidance. This task implements the JWT authentication rails (register/login/refresh/logout) that every account-based feature (US2 onward) depends on — email/password only in v1, per FR-007 (Google sign-in explicitly deferred).

### Gate Criteria

- [ ] Access tokens are short-lived (minutes, not days) and never persisted client-side beyond memory/short-lived storage; refresh tokens are httpOnly, `Secure` in production, `SameSite` appropriate for CSRF mitigation (per `security.csrf: token`).
- [ ] `POST /v1/auth/refresh` rotates the refresh token on every use (old token invalidated) and checks the server-side denylist before issuing a new access token.
- [ ] `POST /v1/auth/logout` adds the current refresh token to the denylist so it can never be replayed.
- [ ] Duplicate email registration returns 409 (RFC7807), never a silent overwrite or 500.
- [ ] `password_hash` is never included in any serialized response (guard via a response DTO/serializer, not manual key deletion scattered across handlers).

---

## 🎯 Objective

Implement `POST /v1/auth/register` (email/password, argon2id hash), `POST /v1/auth/login`, `POST /v1/auth/refresh` (rotate refresh token, httpOnly cookie, server-side denylist), and `POST /v1/auth/logout`, issuing short-lived JWT access tokens.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/modules/auth/auth.module.ts` - NestJS module (not yet imported by `app.module.ts` — deferred to T-057).
- `backend/src/modules/auth/auth.controller.ts` - the four routes above.
- `backend/src/modules/auth/auth.service.ts` - `register()` (hash password with argon2id, create `user` row, exposes an injectable `onUserRegistered` hook point consumed by T-041, issue tokens), `login()` (verify credential, issue tokens), `refresh()` (validate + rotate refresh token, check denylist), `logout()` (denylist current refresh token).
- `backend/src/modules/auth/jwt.strategy.ts` - Passport `JwtStrategy` validating the short-lived access token against `user.public_id`.
- `backend/src/modules/auth/refresh-token.repository.ts` - persistence for issued/rotated/denylisted refresh tokens (e.g., a `refresh_token` table or Redis set — store the JTI/hash, not the raw token).
- `backend/src/modules/auth/password-hasher.service.ts` - thin wrapper around argon2id hash/verify (isolated so it's swappable/testable).
- `backend/src/modules/users/users.repository.ts` - Drizzle access for the `user` table (create/find-by-email), repository pattern; shared by `auth` and later `users` features.
- `shared/src/schemas/auth.schema.ts` - Zod `RegisterSchema` (`email`, `password` with the strong-password policy rules), `LoginSchema`.
- `backend/test/auth.e2e-spec.ts` - Supertest: register → 201 (no `password_hash` in body) → login → 200 with access token + refresh cookie → refresh → 200 new access token, old refresh token now rejected → logout → subsequent refresh with the logged-out token → 401; duplicate-email register → 409; wrong-password login → 401.
- `backend/src/modules/auth/auth.service.spec.ts` - Vitest unit tests for token rotation/denylist logic with the repository mocked.

### Files to Update (REQUIRED)

- `shared/src/index.ts` - export `RegisterSchema`/`LoginSchema` types.

> Note: `backend/src/app.module.ts` import of `AuthModule` (and any global `JwtAuthGuard` registration) is deferred to **T-057** (wiring task), matching the pattern used for T-020/T-021/T-022 → T-037.

### Code/Logic Requirements

- **FR-007**: *"Users MUST be able to register and log in via email + password. Third-party (Google) sign-in is deferred beyond v1 (see Clarifications 2026-07-19); the auth layer SHOULD be structured to admit an additional login provider later without a rebuild."* → implement only email/password in this task; isolate credential verification behind a narrow interface (e.g., `CredentialVerifier`) so a Google strategy can be added later as a sibling implementation, not a rewrite.
- Depends on **T-010** (core schema — `user` table must exist) and **T-013** (shared contracts package must exist for `shared/src/schemas/auth.schema.ts` to land in).
- Refresh-token rotation MUST be atomic (old token invalidated and new token issued in one transaction/operation) to prevent a race where a stolen-but-not-yet-used old token and a legitimate refresh both succeed.
- All new DB access goes through repositories (`users.repository.ts`, `refresh-token.repository.ts`) per `code_patterns.data_access`.

## 🔌 Wiring Checklist

### Web
- [ ] **Backend route** → Registered in main app/router file *(deferred to T-057)*
- [ ] **Frontend page** → Added to app router configuration *(not applicable — backend-only)*
- [ ] **Navigation** → Link added to sidebar/nav component *(not applicable — backend-only)*
- [ ] **API endpoint** → Frontend store/hook calls this endpoint *(consumed by T-043, wired in T-057)*
- [ ] **Component** → Rendered by a parent component *(not applicable — backend-only)*

## ✅ Verification

**Command**: `cd backend && npm test -- auth`
**Success Criteria**: `auth.e2e-spec.ts` and `auth.service.spec.ts` pass — full register→login→refresh(rotated)→logout(denylisted) lifecycle verified, duplicate-email and wrong-password cases return the correct RFC7807 problem responses, and no response body ever contains `password_hash`.

### Integration Verification (if wiring items checked)

Not applicable — no wiring items are checked in this task; end-to-end auth wiring is verified in T-057.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
