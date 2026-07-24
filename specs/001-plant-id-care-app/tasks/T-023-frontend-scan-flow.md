# Task: T-023 - Frontend Scan Flow (Upload → Poll → Result)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US1
**Requirement**: FR-001, FR-003

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
| `frontend.ui_library` / `styling` | mui + emotion (RTL via `stylis-plugin-rtl`) |
| `frontend.state_management` | zustand (client) |
| `frontend.data_fetching` | tanstack-query (server state, polling) |
| `frontend.form_library` / `validation_library` | react-hook-form + zod |
| `conventions.files` | kebab-case (`photo-uploader.tsx`) |
| `conventions.variables` | camelCase |
| `ui_specs.accessibility` | wcag-aa |
| `ui_specs.animations` | css only |

### Domain Rules

- **RTL-first**: root `dir="rtl"`, `lang="fa"`; use only logical CSS properties (`margin-inline-*`, `padding-inline-*`) — never physical `left`/`right`.
- **Async AI via polling**: the scan result is not available synchronously; the UI MUST show a loading/in-progress state while `GET /v1/scans/:id` is polled (TanStack Query `refetchInterval`) until `status` is `completed` or `failed`.
- **70% confidence gate is a UI contract, not just a backend one**: if `lowConfidence: true` (or `species` is null), the UI MUST render the low-confidence prompt and MUST NEVER render species/care-guide UI — there is no client-side "best guess" fallback.
- **No login required**: this flow must work fully unauthenticated (guest); do not gate any part of the upload/result UI behind an auth check.

### API Context (from contracts/)

```yaml
# Relevant endpoints this task's hooks call (specs/001-plant-id-care-app/contracts/openapi.yaml)
POST /v1/scans        # multipart/form-data { photo } → 202 ScanJob { status: pending }
                       # 415 → Problem (disallowed file type)
                       # 403 → Problem (guest scan limit reached — handled by T-043's registration wall, not this task)
GET  /v1/scans/{id}   # poll → ScanJob { status, confidence, species, careGuide, lowConfidence }
```

`ScanJob` shape consumed here (from `shared/src/schemas/scan.schema.ts`, built in T-020):
```ts
{ id: string; type: 'identify' | 'comparison'; status: 'pending' | 'completed' | 'failed';
  confidence: number | null; species: object | null; careGuide: object | null; lowConfidence: boolean }
```

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification and care guidance. This task builds the visitor-facing scan experience: pick/take a photo, watch it process, and see either a species + care guide or a clear low-confidence prompt — the wedge of the entire product, usable with zero login.

### Gate Criteria

- [ ] Upload UI works on mobile (camera capture `capture="environment"`) and desktop (file picker/drag-drop).
- [ ] A visible loading/in-progress state renders continuously from submission until a terminal `status` (`completed` or `failed`) is reached (FR-001/US1 Acceptance Scenario 4).
- [ ] The result view renders species + structured care guide ONLY when `lowConfidence` is false and `species` is non-null; otherwise it renders the low-confidence prompt exclusively.
- [ ] Non-image file selection is rejected client-side with a clear message before any network call (defense in depth; server-side T-014 is the source of truth).
- [ ] All text is Persian; layout is RTL-correct (no physical left/right leaks).

---

## 🎯 Objective

Build the scan UI: photo capture/upload, an in-progress/loading state while the identify job is polled, and a result view showing species + structured care guide or the low-confidence prompt — fully RTL, no login required.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/features/scan/components/photo-uploader.tsx` - camera/file input (mobile `capture="environment"` + desktop drag-drop/file-picker), client-side MIME/type pre-check, submit button.
- `frontend/src/features/scan/components/scan-progress.tsx` - loading/in-progress state (spinner + Persian status copy) shown while `status === 'pending'`.
- `frontend/src/features/scan/components/scan-result.tsx` - renders species name + structured care guide (watering/light/soil/humidity/temperature) when confident; renders `scan-low-confidence-prompt.tsx` otherwise.
- `frontend/src/features/scan/components/scan-low-confidence-prompt.tsx` - low-confidence messaging + "try another photo" CTA.
- `frontend/src/features/scan/hooks/use-create-scan.ts` - TanStack Query `useMutation` wrapping `POST /v1/scans` (multipart), surfaces 415 errors as a user-facing message.
- `frontend/src/features/scan/hooks/use-scan-status.ts` - TanStack Query `useQuery` with `refetchInterval` (e.g., poll every 1.5s while `status === 'pending'`, stop on `completed`/`failed`) wrapping `GET /v1/scans/:id`.
- `frontend/src/features/scan/api/scans-api.ts` - typed fetch wrappers (`createScan`, `getScan`) built on the shared `ScanJob` type from `shared/src/schemas/scan.schema.ts` (T-020).
- `frontend/src/features/scan/scan-flow.tsx` - top-level orchestrating component composing uploader → progress → result, holding the current `scanId` in local state (or a small Zustand slice if it needs to survive route changes).
- `frontend/src/features/scan/index.ts` - barrel export of `ScanFlow` for consumption by the app router (wired in T-037).
- `frontend/src/features/scan/scan-flow.test.tsx` - Vitest + Testing Library: renders uploader by default; shows progress state on submit (mocked pending response); renders species+care-guide result (mocked confident response); renders low-confidence prompt (mocked `lowConfidence: true` response); rejects a non-image file selection client-side without calling the API.

### Files to Update (REQUIRED)

- None required by this task in isolation — `ScanFlow` is not yet rendered by any route. Wiring `ScanFlow` into the home route (`frontend/src/app/(fa)/page.tsx`) and navigation is done by **T-037**.

### Code/Logic Requirements

- **FR-001**: *"System MUST accept a single image upload (image formats only; no video) for identification."* → `photo-uploader.tsx` restricts the file input's `accept` attribute to image MIME types and performs a client-side type check before calling `useCreateScan`, matching the server-side contract from T-014/T-020.
- **FR-003**: *"System MUST present an identification result only when AI confidence is ≥ 70%; when confidence is < 70%, it MUST show a low-confidence prompt and MUST NOT display any species result."* → `scan-result.tsx` branches strictly on `job.lowConfidence` (never re-derives confidence client-side); write a test proving the species/care-guide markup is entirely absent from the DOM in the low-confidence case (not just visually hidden).
- Polling must stop (no further requests) once a terminal status is reached, to avoid wasted requests/battery.
- Depends on **T-020** (scan endpoints + `ScanJob` schema) and **T-003** (frontend skeleton — app shell, theme, RTL setup, TanStack Query provider).

## 🔌 Wiring Checklist

### Web
- [ ] **Backend route** → Registered in main app/router file *(not applicable — frontend-only task)*
- [ ] **Frontend page** → Added to app router configuration *(deferred to T-037 — `ScanFlow` is exported but not yet routed)*
- [ ] **Navigation** → Link added to sidebar/nav component *(deferred to T-037)*
- [ ] **API endpoint** → Frontend store/hook calls this endpoint *(hooks call `/v1/scans` and `/v1/scans/:id` directly in this task; end-to-end route wiring is T-037)*
- [ ] **Component** → Rendered by a parent component *(deferred to T-037 — no route renders `ScanFlow` yet)*

## ✅ Verification

**Command**: `cd frontend && npm test -- scan`
**Success Criteria**: `scan-flow.test.tsx` passes for all four states (idle/upload, in-progress, confident result, low-confidence prompt) and the non-image-file rejection test.

### Integration Verification (if wiring items checked)

Not applicable — no wiring items are checked in this task; the rendered route and navigation are verified via Playwright in T-037.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
