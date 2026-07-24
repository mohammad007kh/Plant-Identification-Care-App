# Task: T-101 - Frontend Health Comparison View

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US5 (Track a plant's health with follow-up photo comparison)
**Requirement**: FR-011

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
| `frontend.framework` | Next.js App Router (React 18) |
| `frontend.ui_library` | MUI + Emotion (RTL, `dir="rtl" lang="fa"`) |
| `frontend.data_fetching` | TanStack Query (polls `GET /v1/scans/:id`) |
| `frontend.form_library` | React Hook Form + Zod |
| `conventions.files` | kebab-case |
| `ui_specs.accessibility` | WCAG-AA |

### Domain Rules (from Station 05 — User Flows)

- **RTL-first**: logical CSS properties; Persian labels via i18n message catalog; trend arrows/icons mirrored appropriately.
- **Follow-up upload**: reuses the shared uploader; posts to `POST /v1/plants/:id/photos`, then polls `GET /v1/scans/:id` until `completed`/`failed`.
- **Result display**: show `improved | worse | unchanged` with the two referenced photos side-by-side; when the API returns "follow-up needed" (<2 photos) show that guidance instead of a verdict.
- **Failure (FR-030)**: on `failed`, show a clear Persian error + retry; confirm credit unaffected.

### API Context (from contracts/openapi.yaml)

```yaml
POST /v1/plants/{id}/photos → 202 ScanJob{type:comparison, status:pending}   (T-060)
GET  /v1/scans/{id}         → ScanJob{ result:{ verdict, referencedPhotoIds } } (T-100)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. This task builds the US5 UI: uploading a follow-up photo on a saved plant and viewing the AI health-trend verdict against prior photos.

### Gate Criteria (from Station 05 — User Flows)

- [ ] Fully RTL, Persian labels via i18n
- [ ] Polls scan job to terminal state
- [ ] Renders verdict + referenced photos, and the <2-photo guidance path
- [ ] Graceful failure + retry (no phantom credit loss shown)

---

## 🎯 Objective

Build the follow-up-photo upload + health-trend result UI within the plant detail experience.

## 🛠️ Implementation Details

### Files to Create

- `frontend/src/features/comparison/comparison-panel.tsx` - upload + trend result panel on the plant detail view
- `frontend/src/features/comparison/use-comparison.ts` - TanStack Query hook (submit + poll)
- `frontend/src/features/comparison/comparison-panel.test.tsx` - renders verdict, <2-photo guidance, and failure/retry

### Files to Update (REQUIRED)

- `frontend/src/features/plants/plant-detail.tsx` - mount the comparison panel (parent renders new component)
- `frontend/src/lib/api/index.ts` - add the follow-up-photo + scan-poll client calls

### Code/Logic Requirements

- Depends on T-100 (result) and T-060 (upload endpoint) and T-061 (plant detail view exists).
- Uses shared `ComparisonResult`/`HealthVerdict` types from `shared/`.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Component** → Rendered by `plant-detail.tsx`
- [ ] **API endpoint** → Hook calls `POST /v1/plants/:id/photos` + polls `GET /v1/scans/:id`

## ✅ Verification

**Command**: `cd frontend && npm test -- comparison`
**Success Criteria**: Component tests pass — verdict + two photos render; <2-photo guidance renders; failure shows retry.

### Integration Verification

```bash
cd frontend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
