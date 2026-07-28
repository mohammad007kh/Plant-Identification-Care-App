# Task: T-037 - Wire US1 (Scan/Guest/Report Controllers + Home Route)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US1
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

| Key                      | Value                                                                     |
| ------------------------ | ------------------------------------------------------------------------- |
| `architecture.pattern`   | modular_monolith — feature modules registered into one NestJS `AppModule` |
| `frontend.framework`     | nextjs (App Router), route group `(fa)` for the Persian/RTL app shell     |
| `frontend.data_fetching` | tanstack-query                                                            |
| `conventions.files`      | kebab-case                                                                |

### Domain Rules

- This is a **wiring task**: it does not implement new business logic. It connects already-built, currently-orphaned pieces from T-020, T-021, T-022 (backend) and T-023 (frontend) so US1 is actually reachable by a real user/browser.
- Guest scans counted server-side (T-021) must be active on the live route — the wiring must not accidentally bypass the guest guard.
- The 70% confidence gate (T-020) is enforced server-side; this task must not add any client-side species fallback when wiring the result view into the route.

### API Context (from contracts/)

```yaml
# Endpoints being exposed end-to-end by this wiring task:
POST /v1/scans
GET  /v1/scans/{id}
POST /v1/misidentification-reports
GET  /v1/health # existing health endpoint (from backend skeleton, T-002) used for the smoke check below
```

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification and care guidance. US1 (identify a plant from a leaf photo) is the product's wedge — it must work end-to-end for an anonymous visitor landing on the home page with zero prior setup.

### Gate Criteria

- [ ] `ScansModule`, `GuestsModule`, and `MisidentificationReportsModule` are all imported by `backend/src/app.module.ts` and their routes respond (not 404).
- [ ] The Next.js home route renders the scan uploader without requiring authentication.
- [ ] The frontend's API client actually calls the real `/v1/scans` and `/v1/scans/:id` endpoints (no leftover mocks in the wired path).
- [ ] Nothing in T-020/T-021/T-022/T-023 is duplicated here — this task only adds imports/registrations/route bindings.

---

## 🎯 Objective

Register the `scans`, `guests`, and `misidentification-reports` controllers in the backend `AppModule`; add the T-023 scan flow as the home route in the Next.js app router with navigation; connect the frontend scan API hooks/store to the live backend.

## 🛠️ Implementation Details

### Files to Create

None — this is a pure wiring task; it only updates existing files.

### Files to Update (REQUIRED)

- `backend/src/app.module.ts` - import and register `ScansModule` (T-020), `GuestsModule` (T-021), `MisidentificationReportsModule` (T-022) in the `imports` array; ensure the shared BullMQ/Redis connection module (from T-015) is available to all three.
- `frontend/src/app/(fa)/page.tsx` - render the `ScanFlow` component (from `frontend/src/features/scan`, T-023) as the home page content, unauthenticated-accessible.
- `frontend/src/components/navigation/main-nav.tsx` (or equivalent existing nav component from the T-003 frontend skeleton) - add/confirm a "شناسایی گیاه" (Identify a Plant) entry pointing at `/` so the scan flow is discoverable from anywhere in the app shell.
- `frontend/src/lib/api/client.ts` - confirm/point the base API client at the real backend origin (e.g., `NEXT_PUBLIC_API_URL`) so `frontend/src/features/scan/api/scans-api.ts` (T-023) hits the live `/v1/scans` endpoints instead of any test/mock base URL left over from unit testing.
- `frontend/src/lib/api/index.ts` (barrel, if present from T-003) - ensure the scan API hooks (`use-create-scan`, `use-scan-status`) are exported/reachable from the shared `lib/api` surface used by pages.

### Code/Logic Requirements

- No new business logic — only imports, module registration, and route/component composition.
- After wiring, an anonymous browser session hitting `/` must be able to complete the full US1 flow: upload → pending → poll → result (or low-confidence prompt), with the guest-scan-limit guard from T-021 active (3rd scan attempt returns the registration-wall response, surfaced to the user, not swallowed).
- Verify no duplicate module registration (each of `ScansModule`/`GuestsModule`/`MisidentificationReportsModule` imported exactly once).

## 🔌 Wiring Checklist

### Web

- [x] **Backend route** → Registered in main app/router file (`backend/src/app.module.ts` now imports `ScansModule`, `GuestsModule`, `MisidentificationReportsModule`)
- [x] **Frontend page** → Added to app router configuration (`frontend/src/app/(fa)/page.tsx` renders `ScanFlow`)
- [x] **Navigation** → Link added to sidebar/nav component (`main-nav.tsx` includes the scan/identify entry)
- [x] **API endpoint** → Frontend store/hook calls this endpoint (`scans-api.ts` hooks call the live `/v1/scans` and `/v1/scans/:id` routes)
- [x] **Component** → Rendered by a parent component (`ScanFlow` rendered by the home page route)

## ✅ Verification

**Command**: `curl -s http://localhost:3001/v1/health | jq '.status=="ok"'`
**Success Criteria**: prints `true` — confirms the backend app boots with all three new modules registered (a misconfigured/duplicate module import would fail Nest's bootstrap and this health check would not respond).

### Integration Verification (if wiring items checked)

```bash
# Backend health smoke check (module registration didn't break bootstrap)
curl -s http://localhost:3001/v1/health | jq '.status=="ok"'

# Frontend: home route renders the uploader (Playwright)
npx playwright test -g "home page renders plant photo uploader"
```

Example Playwright check (add to `frontend/e2e/scan-home.spec.ts` if not already covered by T-023's unit tests):

```ts
import { test, expect } from '@playwright/test';

test('home page renders plant photo uploader', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('photo-uploader')).toBeVisible();
});
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
