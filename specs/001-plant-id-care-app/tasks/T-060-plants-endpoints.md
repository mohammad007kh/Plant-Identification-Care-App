# Task: T-060 - Plants Endpoints (CRUD + Photo History)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US3 (Save plants and view photo history in a profile)
**Requirement**: FR-009, FR-010

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
- Implementation start: 2026-07-26T19:00:56Z by claude
- Implementation end: 2026-07-26T19:00:56Z by claude
- verify-depth: light

## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key                                         | Value                                                           |
| ------------------------------------------- | --------------------------------------------------------------- |
| `architecture.pattern`                      | modular_monolith (NestJS feature module: `plants`)              |
| `architecture.layers`                       | controller → service → repository                               |
| `code_patterns.data_access`                 | repository (no naked Drizzle queries outside the repository)    |
| `code_patterns.error_handling`              | exceptions → global filter → RFC7807 `application/problem+json` |
| `code_patterns.validation_approach`         | schema (Zod, defined in `shared/` and reused by NestJS pipes)   |
| `database.tenancy_model`                    | single_tenant — every query scoped by `user_id`                 |
| `api.pagination`                            | cursor (`?cursor=&limit=`)                                      |
| `api.versioning`                            | URL (`/v1`)                                                     |
| `conventions.files`                         | kebab-case (`plants.controller.ts`)                             |
| `conventions.variables`                     | camelCase                                                       |
| `database.naming_tables` / `naming_columns` | snake_case (`plant`, `photo`, `user_id`)                        |
| `database.primary_key_type`                 | ULID internal `id`; opaque UUID `public_id` exposed in the API  |

### Domain Rules (from Station 07 — Tenancy + Data Architecture)

- **No naked queries**: All DB access for plants/photos MUST go through a `PlantsRepository` whose methods require `userId` as a parameter (e.g. `findById(userId, plantId)`, `list(userId, cursor, limit)`). Never expose a method that fetches a plant by id alone.
- **Tenant isolation is enforced server-side**: never rely on the client to only request its own plant ids. A request for another user's `plant.public_id` MUST return `404` (resource does not exist from this user's perspective), not `403` (which would leak existence).
- **Tenant isolation test plan (mandatory, Station 07 §7.5.4)**: write integration tests proving (a) a user cannot `GET /v1/plants/:id` for another user's plant, (b) `GET /v1/plants` never lists another user's rows, (c) `POST /v1/plants/:id/photos` cannot attach a photo to another user's plant.
- **Data model** (from `data-model.md`): `plant` — `id` (ULID PK), `public_id` (UUID), `user_id` FK, `species_id` FK null, `nickname` text null, `created_at`/`updated_at`. `photo` — `id`, `public_id`, `plant_id` FK null, `scan_id` FK null, `storage_key`, `content_type`, `bytes`, `width`, `height`, `created_at`. A plant has many photos (its "photo history"), ordered by `created_at`.
- **Follow-up photo rule (FR-010)**: `POST /v1/plants/:id/photos` MUST add the photo to the existing plant's history (via `plant_id` FK) rather than creating a new `plant` row. It creates a `scan` row with `type = comparison`, `plant_id` set, and enqueues the async comparison job (comparison AI logic itself belongs to US5/T-015+ scope — this task only needs to create the `scan` row, persist the photo, and return the `202 Accepted` envelope; do not implement the AI comparison logic here).
- **Credit debit for the photo-history endpoint**: `POST /v1/plants/:id/photos` triggers an AI-metered action (comparison). This task creates the endpoint and the DB writes; the actual credit debit/refund plumbing and the 402 guard are implemented by `T-082` (depends on this task's controller existing). Leave a clear extension point (e.g., call a `creditsGuard`/`CreditsService.debit(...)` stub or TODO-free interface call) so `T-082` can wire the guard without restructuring this controller.

### API Context (from contracts/openapi.yaml)

```yaml
# Relevant endpoints for this task
GET  /v1/plants              → list saved plants, cursor paginated (?cursor, ?limit=20)
                                 200 → CursorPage<Plant> { data: Plant[], nextCursor: string|null }
GET  /v1/plants/{id}         → get one plant (photo history + care guide)
                                 200 → Plant { id, nickname, species, photos: [] }
                                 404 → Problem (not found / not owned by caller)
POST /v1/plants               → save an identified plant (from a completed scan)
                                 201 → Plant
POST /v1/plants/{id}/photos   → add a follow-up photo to an existing plant's history
                                 202 → ScanJob { type: comparison, status: pending }
                                 402 → Problem (insufficient credit — see T-082)

# Schemas (components/schemas in openapi.yaml)
Plant: { id: uuid, nickname: string|null, species: object|null, photos: object[] }
CursorPage: { data: [], nextCursor: string|null }
Problem: RFC7807 { type, title, status, detail, requestId }
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a unified AI-credit system, subscription tiers (mock Zarinpal), tracking, chat, reminders, and admin. Stack: TypeScript, NestJS (`backend/`), Next.js (`frontend/`), Drizzle + PostgreSQL, Redis + BullMQ, MUI + Emotion RTL, Zod (`shared/`). Auth is JWT. Patterns: modular monolith, repository, exceptions → RFC7807, Zod validation, single-tenant scoping by `user_id`. This task (US3) delivers the CRUD surface that lets a registered user save an identified plant and keep an ongoing photo history for it — the foundation for tracking, comparison, and reminders in later user stories.

### Gate Criteria (from Station 07 — Tenancy + Data Architecture)

- [ ] Tenant isolation enforced in the DAL (repository requires `userId` on every read/write)
- [ ] "No naked queries" rule followed — no controller/service bypasses the repository
- [ ] Read isolation test: cannot fetch another user's plant by id
- [ ] Write isolation test: cannot attach a photo to another user's plant
- [ ] List endpoint never returns cross-user rows
- [ ] Cursor pagination implemented per `api.pagination: cursor` registry standard
- [ ] Errors returned as RFC7807 `application/problem+json`

---

## 🎯 Objective

Implement the plants CRUD surface: `GET /v1/plants` (cursor-paginated list of the caller's saved plants), `GET /v1/plants/:id` (single plant with photo history + care guide), `POST /v1/plants` (save an identified plant from a completed scan), and `POST /v1/plants/:id/photos` (add a follow-up photo to an existing plant's history). All four endpoints MUST be strictly scoped by `user_id` — a user can never read, list, or mutate another user's plant.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/modules/plants/plants.module.ts` - NestJS module wiring controller/service/repository (not yet registered in `AppModule` — that is `T-077`)
- `backend/src/modules/plants/plants.controller.ts` - the four routes above, JWT-guarded, reading `userId` from the authenticated principal
- `backend/src/modules/plants/plants.service.ts` - business logic: save-plant-from-scan, list, get-one, add-follow-up-photo (creates `scan` row type=comparison + enqueues job stub)
- `backend/src/modules/plants/plants.repository.ts` - Drizzle repository; every method takes `userId` as first parameter (`list(userId, cursor, limit)`, `findById(userId, plantId)`, `create(userId, data)`, `addPhoto(userId, plantId, photoData)`)
- `backend/src/modules/plants/dto/list-plants-query.dto.ts` - cursor/limit query validation
- `shared/src/schemas/plant.schema.ts` - Zod schemas: `PlantSchema`, `CreatePlantSchema`, `AddPlantPhotoSchema` (imported by both this controller and the frontend in `T-061`)
- `backend/test/plants.e2e-spec.ts` - Supertest integration tests, including the mandatory tenancy-isolation tests
- `backend/src/modules/plants/plants.service.spec.ts` - Vitest unit tests for service logic (save-from-scan, add-follow-up-photo branching)

### Files to Update

- `shared/src/index.ts` - export the new `plant.schema.ts` types/schemas so both apps can import them
- (Registering `PlantsModule` in `backend/src/app.module.ts` and any frontend consumption are intentionally OUT of scope here — see `T-077` which wires this module end-to-end. Do not register the module yourself; leave `plants.module.ts` unimported until `T-077`.)

### Code/Logic Requirements

- `GET /v1/plants`: cursor pagination per registry (`?cursor=<opaque>&limit=<default 20>`), scoped by `userId`, ordered by `created_at DESC`. Returns `CursorPage<Plant>`.
- `GET /v1/plants/:id`: resolves `public_id` → internal `id`, scoped by `userId`; returns `404` (RFC7807 Problem) if not found or not owned by the caller. Response includes ordered `photos` (photo history) and the plant's `species`/care-guide reference.
- `POST /v1/plants`: creates a `plant` row from a completed, successful scan belonging to the caller (`species_id`, initial photo via the scan's `photo_id`). Rejects (`400`/RFC7807) if the referenced scan does not belong to the caller or was not a successful identification.
- `POST /v1/plants/:id/photos`: validates the plant belongs to the caller, persists the uploaded photo (`photo.plant_id` set), creates a `scan` row (`type=comparison`, `status=pending`, `plant_id` set), and returns `202 Accepted` with the `ScanJob` envelope. Does not implement the actual AI comparison call (that is US5 scope) — just the persistence + job envelope contract that later tasks build on.
- All four handlers extract `userId` from the JWT principal (from `T-040`); none accept `userId` from the request body/query.
- Input validation via the shared Zod schemas (`code_patterns.validation_approach: schema`).
- Errors use the global RFC7807 exception filter (`code_patterns.error_handling: exceptions`) — do not hand-roll error JSON in the controller.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)

- [ ] **Backend route** → Registered in main app/router file — _deferred to `T-077`, not part of this task_
- [ ] **Frontend page** → N/A (backend-only task)
- [ ] **Navigation** → N/A (backend-only task)
- [ ] **API endpoint** → Frontend store/hook calls this endpoint — _implemented in `T-061`, wired in `T-077`_
- [ ] **Component** → N/A (backend-only task)

## ✅ Verification

**Command**: `cd backend && npm test -- plants`
**Success Criteria**: All Supertest cases in `plants.e2e-spec.ts` and Vitest unit tests in `plants.service.spec.ts` pass, including:

- A logged-in user can list, save, and fetch their own plants
- `POST /v1/plants/:id/photos` adds to the same plant's history (not a new plant)
- **Tenancy isolation**: a second user's JWT cannot `GET /v1/plants/:id` for the first user's plant (`404`), cannot see it in `GET /v1/plants`, and cannot `POST` a photo to it (`404`)

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
