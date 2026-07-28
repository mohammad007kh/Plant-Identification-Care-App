# Task: T-077 - Wire US3 (Plants: Route, Nav, Module Registration)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US3 (Save plants and view photo history in a profile)
**Requirement**: N/A (wiring)

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

| Key                         | Value                                                             |
| --------------------------- | ----------------------------------------------------------------- |
| `architecture.pattern`      | modular_monolith — NestJS `AppModule` imports each feature module |
| `frontend.framework`        | nextjs (App Router, file-based routing)                           |
| `frontend.state_management` | zustand                                                           |
| `frontend.data_fetching`    | tanstack-query                                                    |
| `conventions.files`         | kebab-case                                                        |
| `api.versioning`            | URL (`/v1`)                                                       |

### Domain Rules

- This is a pure integration/wiring task: it must not introduce new business logic. It connects code already built by `T-060` (backend `PlantsModule`) and `T-061` (frontend plant list/detail components) to the running application.
- **Orphan-code rule** (Constitution Directive on wiring): a module or component that exists but is never imported/registered is equivalent to not existing. This task exists specifically to close that gap for US3.
- Tenancy: no new queries are written here; this task only registers/imports existing tenant-scoped code from `T-060`.

### API Context

```yaml
# Endpoints being wired into the running app (implemented in T-060)
GET  /v1/plants
GET  /v1/plants/{id}
POST /v1/plants
POST /v1/plants/{id}/photos
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a unified AI-credit system, subscription tiers (mock Zarinpal), tracking, chat, reminders, and admin. This task closes the loop for US3 by registering the `PlantsModule` (from `T-060`) in the NestJS `AppModule`, and by adding a `/plants` route, a navigation entry, and the plants store/hooks glue (from `T-061`) on the Next.js frontend so a real user can reach the feature end-to-end.

### Gate Criteria

- [ ] `PlantsModule` appears in `AppModule.imports` and the app boots without errors
- [ ] `GET /v1/plants` is reachable over HTTP on the running server
- [ ] `/plants` route renders `PlantList`; `/plants/:id` route renders `PlantDetail`
- [ ] A navigation link to `/plants` is visible to authenticated users
- [ ] No new business logic introduced (wiring only)

---

## 🎯 Objective

Register the plants controller in the backend `AppModule`; add the `/plants` (list) and `/plants/:id` (detail) routes, a navigation entry, and the plants store/hooks glue on the frontend, so US3 is reachable end-to-end by a real user.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/app/(fa)/plants/page.tsx` - Next.js route rendering `PlantList` from `T-061` (`frontend/src/features/plants`), wrapped in the authenticated layout
- `frontend/src/app/(fa)/plants/[id]/page.tsx` - Next.js route rendering `PlantDetail` from `T-061`, reading the `id` route param

### Files to Update

- `backend/src/app.module.ts` - import `PlantsModule` (from `T-060`, `backend/src/modules/plants/plants.module.ts`) into the root module's `imports` array
- `frontend/src/components/navigation.tsx` (or the app's existing primary nav component) - add a "گیاهان من" (My Plants) link pointing to `/plants`, visible only to authenticated users
- `frontend/src/lib/api/query-client.ts` (or equivalent TanStack Query provider registration file, if plants hooks require a query-key namespace registration) - ensure `plants` query keys from `T-061` are covered by the app's existing query client provider (no new provider needed if one already exists from auth/foundation tasks; otherwise register it here)

### Code/Logic Requirements

- `AppModule` import must not change existing module ordering/behavior other than adding `PlantsModule`.
- `/plants` page must redirect unauthenticated visitors to login (reuse the app's existing auth-guard/layout pattern from `T-040`'s frontend counterpart — do not invent a new auth check here).
- `/plants/:id` page must pass the route's `id` (opaque UUID `public_id`) straight through to `use-plant-detail(id)` from `T-061` — no additional transformation.
- Navigation link only renders for authenticated users (reuse existing auth-state check already used by other nav items).
- No changes to `T-060` controller/service/repository logic or `T-061` component internals — if either needs a code change to wire correctly, that is a signal that `T-060`/`T-061` were incomplete, not an invitation to add features here.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [x] **Backend route** → Registered in main app/router file (`backend/src/app.module.ts` imports `PlantsModule`)
- [x] **Frontend page** → Added to app router configuration (`/plants`, `/plants/[id]`)
- [x] **Navigation** → Link added to sidebar/nav component
- [x] **API endpoint** → Frontend store/hook calls this endpoint (`T-061` hooks now reachable from a real route)
- [x] **Component** → Rendered by a parent component (`PlantList`/`PlantDetail` rendered by the new route pages)

## ✅ Verification

**Command**: `curl -s http://localhost:3001/v1/plants -H 'authorization: Bearer <test>' | jq 'type'`
**Success Criteria**: Command prints `"object"` (the `CursorPage` envelope), confirming the route is live and reachable (not a 404 from an unregistered module).

### Integration Verification (if wiring items checked)

```bash
# Verify the backend route is registered and reachable
curl -s http://localhost:3001/v1/plants -H 'authorization: Bearer <test>' | jq 'type'
# Expect: "object"

# Verify the frontend route is navigable (Playwright)
npx playwright test --grep "plants navigation"
# Expect: test asserts that clicking the "گیاهان من" nav link navigates to /plants
# and that the page renders either the plant list or the empty-state prompt.
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
