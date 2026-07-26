# Task: T-020 - Scan Submission & Identify Endpoints

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US1
**Requirement**: FR-001, FR-002, FR-003, FR-015, FR-017

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
- Implementation start: 2026-07-26T15:22:54Z by claude
- Implementation end: 2026-07-26T16:32:33Z by claude
- verify-depth: light

## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key                                 | Value                                                                 |
| ----------------------------------- | --------------------------------------------------------------------- |
| `architecture.pattern`              | modular_monolith                                                      |
| `architecture.layers`               | not layered; feature-module boundaries (`backend/src/modules/*`)      |
| `code_patterns.data_access`         | repository (no naked ORM/Drizzle queries outside a `*.repository.ts`) |
| `code_patterns.error_handling`      | exceptions → mapped to RFC7807 `application/problem+json`             |
| `code_patterns.validation_approach` | schema (Zod, shared package)                                          |
| `database.tenancy_model`            | single_tenant — every user-owned query filtered by `user_id`          |
| `conventions.files`                 | kebab-case (`scans.controller.ts`)                                    |
| `conventions.variables`             | camelCase                                                             |

### Domain Rules

- **IDs**: internal PK = ULID (`id`); external/exposed id = opaque UUID (`public_id`). Never leak the ULID in API responses.
- **Credits**: append-only ledger (`credit_transaction`), idempotent operations via `idempotency_key`, conditional debit (must not go negative), refund-once per `usage_record` (unique `refund_txn_id`).
- **AI gateway**: all AI calls go through the `PlantAIProvider` interface (owned by T-015's `ai-gateway` module) — never call OpenAI/LangChain directly from `scans`.
- **Confidence gate**: hard 70% threshold enforced in the worker, not the controller — a species MUST NEVER be returned/persisted as a result when `confidence < 0.70`.
- **Async AI**: identification runs as a BullMQ job; the HTTP endpoint enqueues and returns immediately (202-style semantics) — the client polls for the result.
- **Guest scans**: this task accepts requests from both authenticated users and unauthenticated guests (guest identification via httpOnly cookie is T-021's concern — do not add guest-limit enforcement logic here; T-021 will extend this controller/service).

### API Context (from contracts/)

```yaml
# Relevant endpoints for this task (specs/001-plant-id-care-app/contracts/openapi.yaml)
POST /v1/scans        # security: [] (guest allowed) — multipart/form-data { photo }
                       # 202 → ScanJob { status: pending }
                       # 402 → Problem (insufficient credit — only for authenticated users)
                       # 415 → Problem (disallowed file type)
GET  /v1/scans/{id}   # security: [] (guest allowed) — poll status/result
                       # 200 → ScanJob { id, type, status, confidence, species, careGuide, lowConfidence }
```

`ScanJob` schema (openapi.yaml `components.schemas.ScanJob`):

```yaml
id: uuid
type: identify | comparison
status: pending | completed | failed
confidence: number | null
species: object | null
careGuide: object | null
lowConfidence: boolean # true when confidence < 0.70
```

Relevant `scan` table columns (data-model.md): `id`, `public_id`, `user_id` (null for guest), `guest_session_id` (null for authenticated; exactly one of the two is set — DB `CHECK`), `plant_id` (null on first identify), `type` (identify|comparison), `status` (pending|completed|failed), `photo_id`, `species_id` (null unless confidence ≥ 0.70), `confidence` numeric(4,3), `result` jsonb, `usage_record_id`.

`usage_record` (AI action state machine, data-model.md): `id`, `user_id`, `action` (identify), `status` (pending|completed|failed), `debit_txn_id`, `refund_txn_id` (null, unique — one refund max), `idempotency_key` (unique).

### Feature Summary

Persian/RTL web app for AI leaf-photo plant identification and care guidance, with a unified AI-credit system, plant tracking/chat/reminders, and an admin panel. This task implements the core identification pipeline: submit a photo, debit credit (if authenticated), run the AI job asynchronously behind the 70% confidence gate, and let the client poll for the result.

### Gate Criteria

- [ ] No response ever includes a `species` value when `confidence < 0.70` (data-model invariant #1).
- [ ] Every debit has at most one refund; `usage_record.refund_txn_id` is unique and only set once (invariant #2, #4).
- [ ] Credit is only debited for authenticated users; guest requests do not touch the ledger.
- [ ] Non-image uploads never reach this endpoint's business logic (enforced by T-014's validation pipe applied here).
- [ ] `scan.user_id` XOR `scan.guest_session_id` is always satisfied (never both, never neither).

---

## 🎯 Objective

Implement `POST /v1/scans` (photo submission, guest-allowed) and `GET /v1/scans/:id` (status/result polling), plus the async identify job worker that calls the AI gateway, enforces the 70% confidence gate, persists the result, and refunds credit on failure.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/modules/scans/scans.module.ts` - NestJS module wiring controller, service, repository, and BullMQ queue registration for `scans` module (not yet imported by `app.module.ts` — see Wiring Checklist).
- `backend/src/modules/scans/scans.controller.ts` - `POST /v1/scans` (multipart upload, calls T-014's file-validation pipe, optional auth via `@Public()`-style guard allowing guest), `GET /v1/scans/:id`.
- `backend/src/modules/scans/scans.service.ts` - orchestrates: validate upload (delegates to T-014), resolve actor (user vs guest session id), debit credit via `CreditsService.debit()` (T-015) when authenticated (idempotency key = `scan:<newScanId>`), persist `scan` row (`status: pending`), enqueue `identify` job on the BullMQ queue owned by `ai-gateway` (T-015), return `ScanJob`.
- `backend/src/modules/scans/scans.repository.ts` - all Drizzle access for `scan` and `photo` tables (repository pattern — no naked queries in the service).
- `backend/src/jobs/identify.processor.ts` - BullMQ `@Processor('identify')` worker: loads the pending scan, calls `PlantAIProvider.identify(photo)` (T-015), applies the 70% gate (`confidence < 0.70` → set `species_id = null`, `result = { lowConfidence: true, message }`; `confidence >= 0.70` → set `species_id`, `result = { careGuide }`), marks `scan.status = completed`, marks `usage_record.status = completed`. On any AI-provider error: marks `scan.status = failed`, calls `CreditsService.refund()` (T-015) using the `usage_record`'s `debit_txn_id` (refund exactly once — guarded by the unique `refund_txn_id`).
- `shared/src/schemas/scan.schema.ts` - Zod `ScanJobSchema` matching the OpenAPI `ScanJob` shape (id, type, status, confidence, species, careGuide, lowConfidence); inferred `ScanJob` type consumed by both backend response serialization and the frontend (T-023).
- `backend/test/scans.e2e-spec.ts` - Supertest integration tests: authenticated submit → 202 pending → poll → completed with species (confidence ≥ 0.70, AI provider mocked); authenticated submit with mocked low confidence → completed with `lowConfidence: true`, no species; AI provider throwing → scan `failed` + credit refunded (assert ledger balance unchanged from pre-attempt).
- `backend/src/modules/scans/scans.service.spec.ts` - Vitest unit tests for the confidence-gate branching and idempotency-key construction, with `PlantAIProvider` and `CreditsService` mocked.

### Files to Update (REQUIRED)

- `shared/src/index.ts` - export `ScanJobSchema` / `ScanJob` type from the new `scan.schema.ts` barrel entry.

> Note: `backend/src/app.module.ts` import of `ScansModule` is intentionally **not** done here — it is registered by the wiring task **T-037** once US1's other endpoints (T-021, T-022) also exist, to avoid partial/premature route exposure. Do not add this task's own app-module wiring.

### Code/Logic Requirements

- **FR-001**: _"System MUST accept a single image upload (image formats only; no video) for identification."_ → controller accepts exactly one `photo` field (multipart), delegates format/type checking to T-014's validation pipe (do not duplicate MIME-sniffing logic here).
- **FR-002**: _"System MUST send the submitted photo to an AI identification service and return the plant's species identity and a structured care guide in a consistent format on success."_ → worker calls `PlantAIProvider.identify()`, persists `result.careGuide` in the fixed `ScanJobSchema` shape.
- **FR-003**: _"System MUST present an identification result only when AI confidence is ≥ 70%; when confidence is < 70%, it MUST show a low-confidence prompt and MUST NOT display any species result."_ → worker MUST branch on `confidence >= 0.70` before ever setting `species_id`; write a unit test asserting `species` is `null`/absent at exactly `confidence = 0.699` and present at `0.700`.
- **FR-015**: _"System MUST deduct credit from the user's monthly balance for every AI-powered action (scan, chat message, comparison) by the configured amount for that action."_ → `scans.service.ts` debits via `CreditsService.debit({ userId, action: 'identify', idempotencyKey })` before enqueueing, only for authenticated requests; on 402 (insufficient credit) return RFC7807 problem, do not enqueue.
- **FR-017**: _"When an AI-powered action fails due to a service error, System MUST refund the consumed credit (leaving the balance unchanged from before the attempt) and show a retry message."_ → `identify.processor.ts` MUST call `CreditsService.refund()` in a catch block around the `PlantAIProvider` call, and the `ScanJob.status = 'failed'` response MUST include a retry-oriented message.
- Idempotency: `POST /v1/scans` must not double-debit if retried with the same client-generated idempotency key (align with `api.idempotency: required` from registry).
- All new DB access goes through `scans.repository.ts` (repository pattern per `code_patterns.data_access`).

## 🔌 Wiring Checklist

### Web

- [ ] **Backend route** → Registered in main app/router file _(deferred to T-037 — see note above)_
- [ ] **Frontend page** → Added to app router configuration _(not applicable to this backend-only task)_
- [ ] **Navigation** → Link added to sidebar/nav component _(not applicable to this backend-only task)_
- [ ] **API endpoint** → Frontend store/hook calls this endpoint _(consumed by T-023, wired in T-037)_
- [ ] **Component** → Rendered by a parent component _(not applicable to this backend-only task)_

## ✅ Verification

**Command**: `cd backend && npm test -- scans`
**Success Criteria**: `scans.e2e-spec.ts` and `scans.service.spec.ts` pass — including: 202 pending → completed-with-species path, completed-with-low-confidence path (no species field), and failed-path-refunds-credit assertion (post-failure balance === pre-attempt balance).

### Integration Verification (if wiring items checked)

Not applicable yet — no wiring items are checked in this task. T-037 adds the integration verification (`curl`/Playwright) once `ScansModule` is registered.

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
