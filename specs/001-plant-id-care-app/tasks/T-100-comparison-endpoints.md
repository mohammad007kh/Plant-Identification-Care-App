# Task: T-100 - Health Comparison (Follow-up Photo Trend)

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
| `architecture.pattern` | modular_monolith (extends `plants` / `scans` modules) |
| `architecture.communication` | async (BullMQ comparison job + client polling) |
| `code_patterns.data_access` | repository (scoped by `user_id`) |
| `code_patterns.error_handling` | exceptions → RFC7807 |
| `database.tenancy_model` | single_tenant — every query scoped by `user_id` |
| `conventions.files` | kebab-case |
| `database.primary_key_type` | ULID `id`; opaque UUID `public_id` |

### Domain Rules (from Station 10 — Metering, Station 07 — Data)

- **Comparison is a metered AI action.** It debits credit via `AiGatewayService.runMeteredAction` (T-015) with `action=comparison`, and refunds on AI failure (FR-017). Do not re-implement metering.
- **Trend result (FR-011)**: compare the new photo against prior photo(s) of the same plant and return `improved | worse | unchanged`, referencing at least the two most recent photos.
- **Fewer-than-two-photos rule**: when the plant has fewer than two photos, DO NOT return a trend — return an explicit "a follow-up photo is needed" response instead. Enforce this before debiting credit (no charge when a comparison can't be run).
- **Persistence**: writes a `comparison_result` row (`scan_id`, `plant_id`, `verdict`, `referenced_photo_ids[]`). The `scan(type=comparison)` row is created by `POST /v1/plants/:id/photos` (T-060); this task provides the worker that processes it plus the result-fetch endpoint.
- **Tenancy**: the comparison job and result endpoint MUST verify the plant/scan belong to the requesting `user_id`; another user's scan id → 404.

### API Context (from contracts/openapi.yaml)

```yaml
# The follow-up upload endpoint (POST /v1/plants/{id}/photos) is created in T-060 and
# enqueues a comparison job. This task implements the worker + result retrieval:
GET /v1/scans/{id}   → ScanJob { type: comparison, status, result: { verdict, referencedPhotoIds } }
                       (polled after the 202 from POST /v1/plants/{id}/photos)
```

### Feature Summary

Persian/RTL web app for AI plant identification + care. US5 lets a registered user upload a follow-up photo of a saved plant and receive an AI health-trend verdict (improved / worse / unchanged) versus prior photos — building on the plant photo-history from US3 and the metered AI gateway from foundation.

### Gate Criteria (from Station 10 — Metering & Limits)

- [ ] Comparison debits/refunds through `runMeteredAction` (no bespoke metering)
- [ ] < 2 photos → "follow-up needed", no credit charged
- [ ] Verdict references the two most recent photos
- [ ] Tenant isolation verified (another user's plant/scan → 404)
- [ ] Result persisted to `comparison_result`

---

## 🎯 Objective

Implement the BullMQ comparison worker and result-fetch path that turns a follow-up photo into an AI health-trend verdict for a saved plant.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/plants/comparison.service.ts` - orchestrates `runMeteredAction` → `PlantAIProvider.compareHealth`, applies the <2-photo rule, persists `comparison_result`
- `backend/src/plants/comparison.worker.ts` - BullMQ processor for `type=comparison` scan jobs
- `backend/src/plants/comparison.repository.ts` - `comparison_result` reads/writes (scoped by `user_id`)
- `backend/src/plants/comparison.service.spec.ts` - unit tests (verdict mapping, <2-photo path charges nothing, tenancy)

### Files to Update (REQUIRED)

- `shared/src/index.ts` - export `ComparisonResult` / `HealthVerdict` types
- (Worker registration + module wiring handled in T-107. `PlantsModule` from T-060 gains this provider there.)

### Code/Logic Requirements

- Worker consumes the comparison job created by T-060, resolves the plant's photo history (scoped by `user_id`), and if ≥2 photos calls `PlantAIProvider.compareHealth(previous, latest)`.
- Maps the provider output to `improved | worse | unchanged` and persists a `comparison_result` referencing the two most recent `photo.public_id`s.
- < 2 photos: sets the scan result to a "follow-up needed" state and does NOT debit credit (or refunds immediately if a debit was optimistically taken — prefer pre-check).
- On AI failure: `runMeteredAction` refunds; scan marked `failed` with a retry message (FR-017/FR-030 alignment).

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **API endpoint** → comparison result surfaced via `GET /v1/scans/:id` (T-020 envelope); worker registered in T-107

## ✅ Verification

**Command**: `cd backend && npm test -- comparison`
**Success Criteria**: Tests pass — ≥2 photos yields a verdict referencing the two latest photos; <2 photos returns "follow-up needed" with no credit charged; AI failure refunds; cross-user scan → 404.

### Integration Verification

```bash
cd backend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
