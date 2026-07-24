# Task: T-043 - Frontend Auth (Register/Login + Registration Wall)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US2
**Requirement**: FR-007, FR-008

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
| `frontend.framework` | nextjs (App Router) |
| `frontend.ui_library` / `styling` | mui + emotion (RTL) |
| `frontend.state_management` | zustand |
| `frontend.data_fetching` | tanstack-query |
| `frontend.form_library` / `validation_library` | react-hook-form + zod |
| `conventions.files` | kebab-case |
| `ui_specs.accessibility` | wcag-aa |

### Domain Rules

- **Email/password only, v1**: per FR-007, no Google/third-party login button should appear — the UI must not imply a third-party option exists.
- **Registration wall trigger**: shown after the guest's 3rd scan attempt is rejected by T-021's backend guard (403 registration-required response) — this is a UI reaction to a specific API response, not a client-side scan counter (the client must never re-implement the 2-scan count itself; it is server-authoritative).
- **Zero-loss messaging**: after registering from the wall, the user must see their prior guest scans now present in their account (FR-008) — the UI must confirm this, not just silently redirect.
- **RTL-first**: Persian copy, logical CSS properties only.

### API Context (from contracts/)

```yaml
# Relevant endpoints this task's hooks call (specs/001-plant-id-care-app/contracts/openapi.yaml)
POST /v1/auth/register   # security: [] — from T-040; merges guest session server-side (T-041)
POST /v1/auth/login      # security: [] — from T-040
POST /v1/scans           # from T-020/T-021 — 403 Problem response is what triggers the registration wall
```

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification and care guidance. This task builds the account-creation surface: register/login forms, the registration wall shown once a guest exhausts their 2 free scans, and a confirmation that prior guest scans survived registration — the conversion moment for US2.

### Gate Criteria

- [ ] Register/login forms validate with the shared Zod schemas (`shared/src/schemas/auth.schema.ts` from T-040) via React Hook Form, surfacing field-level Persian error messages.
- [ ] The registration wall renders in place of (not in addition to, and not silently replacing) the normal scan-result UI when `POST /v1/scans` returns its 403 guest-limit response.
- [ ] Only email/password registration is offered — no Google/social button, consistent with FR-007's v1 scope and US1 Acceptance Scenario 3 ("only email/password registration is offered").
- [ ] Post-registration, the UI explicitly confirms prior guest scans are now present (not just a generic "welcome" message).

---

## 🎯 Objective

Build register/login forms (React Hook Form + Zod), the registration wall shown after 2 guest scans, and a post-registration view confirming prior guest scans now appear in the account.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/features/auth/components/register-form.tsx` - email/password fields (React Hook Form + the shared `RegisterSchema`), submit calls `useRegister`; shows field errors and a top-level error banner for 409 (email already registered) in Persian.
- `frontend/src/features/auth/components/login-form.tsx` - email/password fields (shared `LoginSchema`), submit calls `useLogin`; shows a 401 error banner in Persian.
- `frontend/src/features/auth/components/registration-wall.tsx` - modal/panel shown when a scan attempt is rejected with the guest-limit 403; embeds `RegisterForm` (and a link to `LoginForm` for a guest who already has an account) with copy explaining the 2-scan limit was reached.
- `frontend/src/features/auth/components/guest-scans-restored-banner.tsx` - small confirmation banner/toast shown immediately after a successful registration-from-wall flow, stating the user's prior scans are now saved to their account (satisfies FR-008's user-visible confirmation).
- `frontend/src/features/auth/hooks/use-register.ts` - TanStack Query `useMutation` wrapping `POST /v1/auth/register`; on success, stores the access token (via the auth store — Zustand slice wired in T-057) and marks a "just converted from guest" flag consumed by `guest-scans-restored-banner.tsx`.
- `frontend/src/features/auth/hooks/use-login.ts` - TanStack Query `useMutation` wrapping `POST /v1/auth/login`.
- `frontend/src/features/auth/api/auth-api.ts` - typed fetch wrappers (`register`, `login`) built on `shared/src/schemas/auth.schema.ts` (T-040).
- `frontend/src/features/auth/index.ts` - barrel export (`RegisterForm`, `LoginForm`, `RegistrationWall`) for consumption by the app router / scan flow (wired in T-057).
- `frontend/src/features/auth/register-form.test.tsx` - Vitest + Testing Library: valid submit calls `useRegister` with the right payload; invalid email/password shows field errors without calling the API; 409 response renders the "email already registered" banner.
- `frontend/src/features/auth/registration-wall.test.tsx` - renders when triggered by a mocked 403 guest-limit response; only email/password option visible (assert no Google/social button in the DOM); after a mocked successful register, `guest-scans-restored-banner` renders.

### Files to Update (REQUIRED)

- `frontend/src/features/scan/components/photo-uploader.tsx` (from T-023) - catch the 403 guest-limit-exceeded response from `useCreateScan` and render `RegistrationWall` instead of a generic error message.

### Code/Logic Requirements

- **FR-007**: *"Users MUST be able to register and log in via email + password. Third-party (Google) sign-in is deferred beyond v1..."* → `RegisterForm`/`LoginForm` render only email/password fields; no OAuth button component is imported or rendered anywhere in this feature.
- **FR-008**: *"Upon registration, System MUST save and link all scans the user performed as a guest in that session to the new account."* → this task's job is entirely the UI confirmation of that (already backend-guaranteed by T-041) — `guest-scans-restored-banner.tsx` must appear specifically on the wall→register path, not on a normal (non-wall) registration where there may be nothing to restore.
- Depends on **T-040** (auth endpoints + shared Zod schemas) and **T-023** (scan flow — the wall integrates with the uploader's error handling).
- Form validation errors and API errors are both rendered in Persian, RTL-correct.

## 🔌 Wiring Checklist

### Web
- [ ] **Backend route** → Registered in main app/router file *(not applicable — frontend-only task)*
- [ ] **Frontend page** → Added to app router configuration *(dedicated `/login`/`/register` routes, if any, are added in T-057; this task builds the components/hooks and wires the wall directly into the scan uploader)*
- [ ] **Navigation** → Link added to sidebar/nav component *(login/logout nav entries deferred to T-057)*
- [ ] **API endpoint** → Frontend store/hook calls this endpoint *(`use-register`/`use-login` call the live T-040 endpoints)*
- [ ] **Component** → Rendered by a parent component *(`RegistrationWall` is rendered by `photo-uploader.tsx`, updated above; standalone `/login`/`/register` page rendering is T-057)*

## ✅ Verification

**Command**: `cd frontend && npm test -- auth`
**Success Criteria**: `register-form.test.tsx` and `registration-wall.test.tsx` pass — valid/invalid submissions behave correctly, only email/password is offered, and the guest-scans-restored confirmation appears after a wall-triggered registration.

### Integration Verification (if wiring items checked)

Not applicable for the standalone `/login`/`/register` routes and nav — verified in T-057. The uploader→wall integration checked above is covered by this task's own Vitest suite.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
