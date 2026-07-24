# Task: T-061 - Frontend Plant List & Detail (Profile)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US3 (Save plants and view photo history in a profile)
**Requirement**: FR-009

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
| `frontend.framework` | nextjs (App Router) |
| `frontend.ui_library` / `styling` | MUI + Emotion, RTL via `stylis-plugin-rtl` |
| `frontend.state_management` | zustand (client state) |
| `frontend.data_fetching` | tanstack-query (server state / caching) |
| `frontend.form_library` / `validation_library` | react-hook-form + Zod |
| `conventions.files` | kebab-case (`plant-list.tsx`) |
| `conventions.variables` | camelCase |
| `conventions.classes` | PascalCase (React components) |
| `ui_specs.accessibility` | WCAG AA |
| `ui_specs.responsive` | true — mobile-first |
| Testing | Vitest (unit/component), colocated tests, 80% coverage target |

### Domain Rules (from plan.md — Frontend/UI Specifications)

- `dir="rtl"`, `lang="fa"` at root; use logical CSS properties (`margin-inline-*`, `padding-inline-*`) — never physical `left`/`right`.
- No hardcoded plan/tier data anywhere in this feature (not applicable to this task directly, but the same "fetch, don't hardcode" discipline applies to species/care-guide content — always render from the API response, never inline placeholder copy).
- Empty states are a first-class requirement (spec Edge Cases: "New accounts with no plants, chats, or reminders show guiding empty states rather than blank screens").
- Persian-only UI for v1 (all copy in this feature must be Persian; keep strings centralized for future i18n per `frontend.i18n_posture: i18n_from_day_one`).

### API Context (consumes `T-060`)

```yaml
# Relevant endpoints for this task (already implemented by T-060; this task only calls them)
GET  /v1/plants              → list saved plants, cursor paginated (?cursor, ?limit=20)
                                 200 → { data: Plant[], nextCursor: string|null }
GET  /v1/plants/{id}         → get one plant: { id, nickname, species, photos: [] }
POST /v1/plants/{id}/photos   → add a follow-up photo (returns 202 ScanJob, out of scope for this task's UI beyond a basic "upload" action)

Plant: { id: uuid, nickname: string|null, species: object|null, photos: object[] }
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a unified AI-credit system, subscription tiers (mock Zarinpal), tracking, chat, reminders, and admin. This task builds the user-facing profile screens for US3: a plant list (with an empty-state prompt for new users) and a plant detail view showing photo history and the care guide, consuming the `T-060` backend endpoints via TanStack Query hooks.

### Gate Criteria (from Station 05 — User Flows / Edge State Checklist)

- [ ] Empty state implemented for a user with zero saved plants (spec Acceptance Scenario US3.3)
- [ ] Loading state while plants/photo history are being fetched
- [ ] Error state (fetch failure) with a retry affordance (spec: "fail gracefully... with a retry prompt")
- [ ] All text in Persian; RTL layout verified (logical CSS properties only)
- [ ] Components colocated with tests per `test_organization: colocated`

---

## 🎯 Objective

Build the profile plant list (with an empty-state prompt guiding a new user to scan their first plant) and a plant detail view showing photo history and the care guide, under `frontend/src/features/plants/`.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/features/plants/api/plants-api.ts` - typed fetch client for `GET /v1/plants`, `GET /v1/plants/:id` (imports `shared/src/schemas/plant.schema.ts` from `T-060` for response typing)
- `frontend/src/features/plants/hooks/use-plants-list.ts` - TanStack Query hook wrapping `GET /v1/plants` with cursor pagination
- `frontend/src/features/plants/hooks/use-plant-detail.ts` - TanStack Query hook wrapping `GET /v1/plants/:id`
- `frontend/src/features/plants/components/plant-list.tsx` - list view; renders `PlantListEmptyState` when the list is empty
- `frontend/src/features/plants/components/plant-list-empty-state.tsx` - empty-state prompt ("no saved plants yet — scan your first plant") with a CTA
- `frontend/src/features/plants/components/plant-card.tsx` - single plant summary card (thumbnail, nickname/species, tap-through to detail)
- `frontend/src/features/plants/components/plant-detail.tsx` - detail view composing photo history + care guide
- `frontend/src/features/plants/components/photo-history.tsx` - ordered photo history renderer
- `frontend/src/features/plants/components/care-guide-card.tsx` - structured care guide display (watering, light, soil, humidity, temperature, notes)
- `frontend/src/features/plants/components/plant-list.test.tsx` - Vitest + Testing Library: renders list, renders empty state, loading/error states
- `frontend/src/features/plants/components/plant-detail.test.tsx` - Vitest + Testing Library: renders photo history + care guide, handles missing/loading data
- `frontend/src/features/plants/index.ts` - barrel export (`PlantList`, `PlantDetail`, hooks)

### Files to Update

- (This task produces a self-contained feature folder with no consumers yet. Route registration, navigation entry, and store wiring are handled by `T-077` — do not create `frontend/src/app/**/plants/page.tsx` routes here.)

### Code/Logic Requirements

- `PlantList` renders `PlantCard` items from `use-plants-list`; on empty `data` array, renders `PlantListEmptyState` instead (spec Acceptance Scenario US3.3).
- `PlantDetail` renders `PhotoHistory` (ordered oldest→newest or newest→oldest, consistent and tested) and `CareGuideCard` from the plant's `species.care_guide` (jsonb: watering, light, soil, humidity, temperature, notes per `data-model.md`).
- Loading state: skeleton/spinner while `isLoading`; Error state: retry button that re-triggers the query (spec: "fail gracefully... with a retry prompt", FR-030).
- All components use MUI `sx`/Emotion styling with logical CSS properties only (no `marginLeft`/`marginRight`).
- All user-facing strings in Persian.
- Components accept props via TypeScript interfaces; no default exports (named exports preferred per plan.md Component Standards).

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → N/A (frontend-only task; consumes `T-060`)
- [ ] **Frontend page** → Added to app router configuration — _deferred to `T-077`_
- [ ] **Navigation** → Link added to sidebar/nav component — _deferred to `T-077`_
- [ ] **API endpoint** → Frontend store/hook calls this endpoint — done in this task (`use-plants-list.ts`, `use-plant-detail.ts` call `T-060`'s endpoints)
- [ ] **Component** → Rendered by a parent component — _`PlantList`/`PlantDetail` are rendered by the route pages created in `T-077`_

## ✅ Verification

**Command**: `cd frontend && npm test -- plants`
**Success Criteria**: All Vitest/Testing Library tests in `plant-list.test.tsx` and `plant-detail.test.tsx` pass, covering: populated list render, empty-state render, loading state, error/retry state, and photo-history + care-guide rendering in the detail view.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
