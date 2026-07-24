# Task: T-022 - Misidentification Report Endpoint

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US1
**Requirement**: Supports FR-025

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
| `architecture.layers` | not layered; feature-module boundaries (`backend/src/modules/misidentification-reports`) |
| `code_patterns.data_access` | repository |
| `code_patterns.error_handling` | exceptions → RFC7807 `application/problem+json` |
| `code_patterns.validation_approach` | schema (Zod) |
| `database.tenancy_model` | single_tenant; reports scoped by `user_id` where present, but guest-submitted reports are also accepted (see below) |
| `conventions.files` | kebab-case |
| `conventions.variables` | camelCase |

### Domain Rules

- **IDs**: ULID PK + opaque UUID `public_id`, consistent with every other entity.
- **Guest support**: because misidentification can happen on a guest's scan (US1, before registration), this endpoint must accept reports tied to a `scan_id` regardless of whether that scan belongs to a `user` or a `guest_session` — do not require authentication.
- **No AI/credit involvement**: submitting a report is not an AI-powered action; it does not touch the credit ledger.
- **Admin consumption**: this task only creates the report; the admin review UI/endpoint (`GET /v1/admin/misidentification-reports`) is out of scope here (separate admin task) — this task must simply guarantee the report is persisted with everything admins will need (photo + AI result) per FR-025.

### API Context (from contracts/)

```yaml
# Relevant endpoint for this task (specs/001-plant-id-care-app/contracts/openapi.yaml)
POST /v1/misidentification-reports
  tags: [scans]
  summary: Report a misidentification (photo + AI result)
  responses: { '201': created }
```

Relevant `misidentification_report` table (data-model.md):
| Column | Type | Notes |
|---|---|---|
| id | ulid PK | |
| public_id | uuid | |
| user_id | ulid FK | (nullable in practice for guest-submitted reports — see Domain Rules) |
| scan_id | ulid FK | the scan being reported |
| photo_id | ulid FK | the photo from that scan |
| ai_result | jsonb | snapshot of the AI's result at report time |
| note | text null | optional user-supplied note |
| status | enum(open, reviewed) | default `open` |
| created_at | timestamptz | |

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification and care guidance. When the AI gets a scan wrong, users can flag it; the flag is stored with the original photo and AI result so admins can later review and improve the species catalog (FR-025, admin-facing — US9).

### Gate Criteria

- [ ] A report always captures the `scan_id`, its `photo_id`, and a snapshot of `ai_result` at submission time (so later edits to the species catalog don't retroactively change what's shown to admins).
- [ ] Reports can be submitted for both guest-owned and user-owned scans; the endpoint never requires authentication to accept a valid report.
- [ ] A report referencing a nonexistent or foreign (not-owned, when authenticated) `scan_id` is rejected (404/403 RFC7807), never silently accepted with null data.
- [ ] `note` is optional and, when present, is validated/sanitized (no unbounded length, no raw HTML) before persistence.

---

## 🎯 Objective

Implement `POST /v1/misidentification-reports`, storing the reported photo, a snapshot of the AI result, and an optional user note, for later admin review.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/modules/misidentification-reports/misidentification-reports.module.ts` - NestJS module (not yet imported by `app.module.ts` — deferred to T-037).
- `backend/src/modules/misidentification-reports/misidentification-reports.controller.ts` - `POST /v1/misidentification-reports`, no auth guard (guest scans must be reportable); accepts `{ scanId, note? }`.
- `backend/src/modules/misidentification-reports/misidentification-reports.service.ts` - loads the referenced `scan` (via `ScansService`/`ScansRepository` from T-020, read-only), verifies it exists and — if the caller is authenticated — that it belongs to that user (guest-owned scans are reportable by anyone holding the scan's public id, matching the no-login UX of US1), snapshots `scan.result` into `ai_result`, persists the report.
- `backend/src/modules/misidentification-reports/misidentification-reports.repository.ts` - Drizzle access for `misidentification_report` (repository pattern).
- `shared/src/schemas/misidentification-report.schema.ts` - Zod schema for the request body (`scanId: uuid`, `note: string().max(1000).optional()`).
- `backend/test/misidentification-reports.e2e-spec.ts` - Supertest: valid report on a completed scan → 201 with persisted `ai_result` snapshot; report on nonexistent `scanId` → 404 problem; report with an over-length `note` → 400 problem; guest-submitted report (no auth header) on a guest-owned scan → 201.

### Files to Update (REQUIRED)

- `shared/src/index.ts` - export the new misidentification-report Zod schema/type.

> Note: `backend/src/app.module.ts` import of `MisidentificationReportsModule` is deferred to **T-037** (wiring task), consistent with T-020/T-021.

### Code/Logic Requirements

- Supports **FR-025**: *"Admins MUST be able to view user-submitted misidentification reports, each shown with the associated photo and AI result."* → this task is the write side that guarantees the `photo` and `ai_result` snapshot exist and are queryable for that future admin read endpoint; it does not implement the admin GET.
- Depends on **T-012** (support schema — misidentification report data shape) and **T-020** (scans endpoints — to resolve/validate `scanId`).
- All new DB access goes through `misidentification-reports.repository.ts` (repository pattern per `code_patterns.data_access`).
- Input validation at the boundary via the shared Zod schema (per `code_patterns.validation_approach`); reject before touching the database.

## 🔌 Wiring Checklist

### Web
- [ ] **Backend route** → Registered in main app/router file *(deferred to T-037)*
- [ ] **Frontend page** → Added to app router configuration *(not applicable — backend-only)*
- [ ] **Navigation** → Link added to sidebar/nav component *(not applicable — backend-only)*
- [ ] **API endpoint** → Frontend store/hook calls this endpoint *(the "report misidentification" UI action, if surfaced in T-023's result view, is wired in T-037)*
- [ ] **Component** → Rendered by a parent component *(not applicable — backend-only)*

## ✅ Verification

**Command**: `cd backend && npm test -- misidentification-reports`
**Success Criteria**: `misidentification-reports.e2e-spec.ts` passes — valid report persists with photo + AI-result snapshot, invalid `scanId` returns 404, oversized `note` returns 400, and guest-submitted reports succeed without auth.

### Integration Verification (if wiring items checked)

Not applicable — no wiring items are checked in this task; registration and any UI trigger are verified in T-037.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
