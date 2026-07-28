# Task: T-057 - Wire US2 (Auth Controller/Guard + Frontend Auth Store/Routes)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US2
**Requirement**: N/A (integration — Wiring task)

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

| Key                         | Value                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `architecture.pattern`      | modular_monolith — feature modules registered into one NestJS `AppModule`                       |
| `backend.auth_method`       | jwt (registry deviation: short-lived access + rotating httpOnly refresh + server-side denylist) |
| `frontend.framework`        | nextjs (App Router)                                                                             |
| `frontend.state_management` | zustand                                                                                         |
| `frontend.data_fetching`    | tanstack-query                                                                                  |
| `conventions.files`         | kebab-case                                                                                      |

### Domain Rules

- This is a **wiring task**: it does not implement new business logic. It connects already-built, currently-orphaned pieces from T-040/T-041 (backend) and T-043 (frontend) so US2 (register after the guest limit, keep prior scans) is reachable end-to-end and the rest of the app can rely on request-scoped auth.
- Once wired, every non-public route in the backend must be protected by the JWT guard by default (explicit `@Public()` opt-out for guest-allowed endpoints like `POST /v1/scans`, `GET /v1/scans/:id`, `POST /v1/misidentification-reports`, `GET /v1/subscriptions/plans`, `GET /v1/payments/verify`) — do not leave protected-by-convention routes accidentally open.
- Token refresh must happen transparently on the frontend (no user-visible re-login) whenever the access token expires mid-session.

### API Context (from contracts/)

```yaml
# Endpoints being exposed/protected end-to-end by this wiring task:
POST /v1/auth/register
POST /v1/auth/login
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/health # existing health endpoint used for the smoke check below
```

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification and care guidance. US2 (register after the guest limit, keep prior scans) is the conversion mechanic that turns anonymous wedge usage (US1) into a retained account — it must work end-to-end: real cookies, real token rotation, real protected routes.

### Gate Criteria

- [ ] `AuthModule` (T-040) is imported by `backend/src/app.module.ts` and a global `JwtAuthGuard` is registered (with an explicit allowlist of `@Public()` routes matching the OpenAPI `security: []` endpoints).
- [ ] The frontend Zustand auth store holds the access token in memory (not `localStorage`, to limit XSS blast radius) and is populated by both `use-login` and `use-register` (T-043).
- [ ] A 401 from any authenticated API call triggers a single transparent `POST /v1/auth/refresh` attempt (via the refresh httpOnly cookie) before failing over to a login redirect.
- [ ] Login/logout are reachable from the nav, and a protected route (e.g., a placeholder profile/plants route) redirects an unauthenticated visitor to login.

---

## 🎯 Objective

Register the auth controller and JWT guard in the backend app module; wire the frontend auth store, transparent token refresh, protected routes, and nav (login/logout).

## 🛠️ Implementation Details

### Files to Create

None — this is a pure wiring task; it only updates existing files. (If no global guard/interceptor exists yet from the backend skeleton, this task creates exactly the minimal registration glue below — not new feature logic.)

### Files to Update (REQUIRED)

- `backend/src/app.module.ts` - import `AuthModule` (T-040); register the JWT `AuthGuard` as the global `APP_GUARD` with a `@Public()` decorator/metadata allowlist covering the guest-allowed routes listed in Domain Rules above (cross-check against every `security: []` entry in `contracts/openapi.yaml`).
- `frontend/src/lib/store/auth-store.ts` (Zustand slice; create only if no such file exists from the T-003 skeleton — otherwise extend it) - holds `{ accessToken, user, setSession(), clearSession() }`; populated by `use-login`/`use-register` (T-043) on success.
- `frontend/src/lib/api/client.ts` - add a response interceptor: on 401, attempt one `POST /v1/auth/refresh` (relies on the httpOnly cookie, no explicit token needed) and retry the original request once; on refresh failure, call `clearSession()` and redirect to `/login`.
- `frontend/src/app/(fa)/(protected)/layout.tsx` (or equivalent protected route group from the T-003 skeleton) - guard: redirect to `/login` when `auth-store` has no `accessToken` and the refresh attempt above also fails.
- `frontend/src/components/navigation/main-nav.tsx` - add login/logout entries: show "ورود" (Login) when signed out, show a logout action (calling `POST /v1/auth/logout` then `clearSession()`) plus account entry when signed in.
- `frontend/src/app/(fa)/login/page.tsx` and `frontend/src/app/(fa)/register/page.tsx` - thin route files rendering `LoginForm`/`RegisterForm` (from T-043) inside the app shell.

### Code/Logic Requirements

- No new business logic — only guard/module registration, store wiring, and route/component composition.
- The global guard's public-route allowlist MUST be kept in sync with the OpenAPI spec's `security: []` markers; a mismatch either locks out a guest-allowed flow (breaking US1) or accidentally exposes a route that should require auth.
- Verify `AuthModule` is imported exactly once in `app.module.ts` (no duplicate registration alongside anything T-037 already added).
- After wiring, the full US2 path must work in a real browser: guest hits the 3rd-scan wall (T-021/T-037) → registers via the wall (T-043) → session established via this task's store/guard wiring → guest scans visible (T-041).

## 🔌 Wiring Checklist

### Web

- [x] **Backend route** → Registered in main app/router file (`backend/src/app.module.ts` imports `AuthModule` and registers the global `JwtAuthGuard`)
- [x] **Frontend page** → Added to app router configuration (`/login`, `/register`, and the protected route group layout)
- [x] **Navigation** → Link added to sidebar/nav component (`main-nav.tsx` shows login/logout state)
- [x] **API endpoint** → Frontend store/hook calls this endpoint (`client.ts` interceptor calls `/v1/auth/refresh`; `auth-store.ts` consumes `/v1/auth/login`/`register` results)
- [x] **Component** → Rendered by a parent component (`LoginForm`/`RegisterForm` rendered by their respective route pages)

## ✅ Verification

**Command**: `curl -s -X POST http://localhost:3001/v1/auth/login -d '{}' -H 'content-type: application/json' | jq '.status'`
**Success Criteria**: prints a 4xx value (e.g., `400` or `401`) as an `application/problem+json` body — confirms the route is live, reachable without a prior token (it's a `@Public()` route), and correctly rejects an empty/invalid credential payload via RFC7807 rather than a raw 500 or a 404 (which would indicate `AuthModule` isn't actually registered).

### Integration Verification (if wiring items checked)

```bash
# Backend: auth route is live and validates input (RFC7807 problem, not 404/500)
curl -s -X POST http://localhost:3001/v1/auth/login -d '{}' -H 'content-type: application/json' | jq '.status'

# Frontend: login flow (Playwright)
npx playwright test -g "user can log in and see an authenticated nav state"
```

Example Playwright check (add to `frontend/e2e/auth-login.spec.ts` if not already covered by T-043's unit tests):

```ts
import { test, expect } from '@playwright/test';

test('user can log in and see an authenticated nav state', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('ایمیل').fill('test@example.com');
  await page.getByLabel('رمز عبور').fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page.getByTestId('nav-account-menu')).toBeVisible();
});
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
