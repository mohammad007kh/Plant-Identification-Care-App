# Task: T-010 - DB Schema: Core Entities (users, guest_session, plant, species, photo, scan)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US1, US2, US3 (data foundation)
**Requirement**: N/A — data foundation for US1-US3 (no single FR maps 1:1 to schema-only work)

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
- Implementation start:  2026-07-24T21:28:03Z by claude:opus-4-8
- Implementation end:    2026-07-24T21:38:34Z by claude:opus-4-8
- verify-depth:          light
## 📋 Embedded Context (READ THIS FIRST)

<!--
  SELF-CONTAINED TASK (Constitution Directive 8):
  This section contains ALL context needed to implement this task.
  Do NOT read plan.md, spec.md, stations, or subagents.

  If this section is empty or insufficient, report as task quality issue.
-->

### Project Standards (from registry)

| Key | Value |
|-----|-------|
| `architecture.pattern` | modular_monolith |
| `code_patterns.data_access` | repository (schema itself is data-access-agnostic; repositories consuming it land in feature-module tasks) |
| `code_patterns.validation_approach` | schema (Zod at the API boundary — not enforced at the DB layer beyond column types/constraints) |
| `database.tenancy_model` | single_tenant — every user-owned row carries `user_id`; server-side scoping only, no naked cross-user queries |
| `database.type` | postgresql |
| `database.naming_tables` / `naming_columns` | snake_case |
| `database.primary_key_type` | ulid (internal `id`); external id = opaque `uuid` (`public_id`), exposed in APIs/URLs |
| `database.audit_columns` | true — `created_at`/`updated_at` (timestamptz, UTC) on every table |
| `database.migration_strategy` | expand_contract |
| `conventions.files` | kebab-case (e.g. `guest-session.ts`, `plant.ts`) |

### Domain Rules (from subagent/station)

- **Conventions** (data-model.md header): PostgreSQL + Drizzle; internal PK = ULID (`id`); external id = opaque UUID (`public_id`) exposed in APIs/URLs; snake_case tables/columns; money = integer minor-units (not used by this task's tables); time = `timestamptz` UTC; audit columns `created_at`/`updated_at` on all tables. Every user-owned row carries `user_id` (tenancy boundary).
- **Tenancy gate** (Station 07): tenancy = single-tenant B2C via `user_id` FK; enforcement = server-side scoping (no naked cross-user queries); isolation test plan = integration tests assert a user can never read another user's rows. This task must write at least one such isolation test for the `plant`/`scan` tables.
- **`user` table**: `id` (ulid PK), `public_id` (uuid, unique, exposed), `email` (citext, unique), `password_hash` (text, argon2id), `subscription_tier_id` (ulid FK → `subscription_tier` — **defer this FK to T-011**; for this task, add the column as a nullable ulid reference without the FK constraint, or omit the column and let T-011 add it via `ALTER TABLE` under the expand_contract strategy — prefer the latter to avoid a forward reference to a table this task doesn't own), `credit_balance` (integer, denormalized cache — again a cross-cutting concern with T-011; include the column here since it lives on `user`, default 0), `notif_email_enabled`/`notif_push_enabled` (boolean, default true), `deletion_status` (enum: `active`/`pending_deletion`/`purged`, default `active`), `deletion_requested_at` (timestamptz null), `role` (enum: `user`/`admin`, default `user`), `created_at`/`updated_at`.
  - State transitions (deletion): `active → pending_deletion` (request) → `active` (cancel within 7d) OR `purged` (grace elapsed; purge job removes rows + storage objects, writes PII-free `deletion_audit` — `deletion_audit` table itself is out of scope for this task, owned by T-012).
- **`guest_session` table**: `id` (ulid PK, matches an httpOnly guest-id cookie set by the auth/guest module in a later task), `ip_hash` (text, per-IP backstop), `scan_count` (integer, server-authoritative, limit enforced in application logic — this task only stores the counter), `status` (enum: `active`/`converted`), `converted_to_user_id` (ulid FK → `user`, null), `created_at`.
  - Merge rule: at registration, re-parent owned `scan`/`plant` rows to the new user in one transaction; set `status=converted` (a unique constraint/guard — e.g. a partial unique index on `converted_to_user_id` where not null — prevents double-convert; enforce this at the schema level in this task even though the merge transaction logic itself is implemented in a later auth task).
- **`plant` table**: owner = `user`. Columns: `id`, `public_id`, `user_id` (FK → `user`), `species_id` (FK → `species`, nullable), `nickname` (text, nullable), `created_at`/`updated_at`. Has many `photo`/`scan` (FK direction is child→parent, defined on those tables).
- **`species` table** (catalog, admin-maintained): `id`, `public_id`, `scientific_name`, `common_name_fa`, `care_guide` (jsonb: watering, light, soil, humidity, temperature, notes), `created_by` (references the admin `user.id` who last edited it), `created_at`/`updated_at`. Editing a care guide must be reflected in future identification results (enforced by application logic in a later admin task, not by this schema task).
- **`scan` table**: a single identification/comparison event. Owner = `user` OR `guest_session` (exactly one — enforce via a `CHECK` constraint, e.g. `CHECK ((user_id IS NULL) != (guest_session_id IS NULL))`). Columns: `id`, `public_id`, `user_id` (FK, nullable), `guest_session_id` (FK, nullable), `plant_id` (FK, nullable — set when saved/follow-up), `type` (enum: `identify`/`comparison`), `status` (enum: `pending`/`completed`/`failed` — job lifecycle), `photo_id` (FK → `photo`, the primary uploaded photo), `species_id` (FK, nullable — result, only if confidence ≥ 0.70), `confidence` (numeric(4,3), nullable, 0.000-1.000), `result` (jsonb, nullable — care guide snapshot / comparison verdict), `usage_record_id` (FK → `usage_record` — **defer to T-011**; add as a nullable ulid column without FK constraint in this task, or omit and let T-011 add via `ALTER TABLE`; prefer omitting to avoid the forward reference, matching the `user.subscription_tier_id` approach above), `created_at`.
  - **Critical invariant** (must be enforced/tested here): if `confidence < 0.70` → `species_id` MUST be NULL, result = low-confidence prompt; never expose a species. This is a business rule, best enforced by a `CHECK` constraint where feasible (e.g. `CHECK (confidence IS NULL OR confidence >= 0.700 OR species_id IS NULL)`) plus an integration test asserting it.
- **`photo` table**: `id`, `public_id`, `plant_id` (FK, nullable), `scan_id` (FK, nullable), `storage_key` (text, randomized — actual storage integration lands in T-014), `content_type`, `bytes`, `width`, `height`, `created_at`. Belongs to a plant's history and/or a scan.
- **Critical invariants owned by this task's tables** (from data-model.md "Critical invariants" section): (1) No species result when `confidence < 0.70`. (3) Guest scan limit = 2, server-authoritative (column exists here; limit enforcement is application logic in a later task) — all guest scans transfer to `user` on registration (zero loss) — schema must support the re-parenting update (`scan.user_id`/`plant.user_id` are simple FK updates, no special schema needed beyond what's defined). (6) A user can never read another user's owned rows (tenancy) — tested via integration test in this task.

### API Context (from contracts/)

Not applicable directly — this is a schema/migration task with no HTTP endpoints. For forward reference, the entities defined here back these future endpoints: `POST /v1/scans`, `GET /v1/scans/{id}`, `GET /v1/plants`, `POST /v1/plants`, `GET /v1/plants/{id}`, `POST /v1/plants/{id}/photos` (all implemented in later feature-module tasks, not this one).

### Feature Summary

A Persian/RTL web app that identifies plants from a leaf photo via an AI provider (behind a 70% confidence gate), lets registered users save plants and view photo history, and supports guest scanning with a 2-scan limit before requiring registration. This task defines the Drizzle schema and migration for the core entities (`users`, `guest_session`, `plant`, `species`, `photo`, `scan`) that all of that functionality is built on.

### Gate Criteria (from subagent/station)

- [ ] All tables use ULID `id` as internal PK and a unique `public_id` UUID column exposed externally.
- [ ] All tables/columns are snake_case; all tables have `created_at`/`updated_at` (`timestamptz`, UTC) audit columns (except tables where a field is explicitly append-only/immutable and only `created_at` applies — not the case for any table in this task).
- [ ] Every user-owned table (`plant`, `scan` when owned by a user, `photo` transitively) carries a `user_id` (directly or via its parent) enabling server-side tenancy scoping.
- [ ] The `scan.confidence < 0.70 ⇒ species_id IS NULL` invariant is enforced (CHECK constraint) and covered by a test.
- [ ] The `scan` "exactly one of user_id/guest_session_id" invariant is enforced (CHECK constraint) and covered by a test.
- [ ] A migration is generated (via Drizzle Kit) and applies cleanly against a running local Postgres.
- [ ] An integration test proves a user cannot read another user's `plant`/`scan` rows (tenancy isolation).

---

## 🎯 Objective

Define the Drizzle ORM schema (and generate the corresponding migration) for the core domain entities — `user`, `guest_session`, `plant`, `species`, `photo`, `scan` — establishing ULID internal PKs with opaque UUID `public_id`s, snake_case naming, audit columns, tenancy via `user_id`, and the confidence-gate + guest/user-ownership invariants that the rest of the identification/plant-tracking feature set (US1-US3) depends on.

## 🛠️ Implementation Details

<!--
  CONTEXT PINNING:
  This section contains ALL the info needed to write code.
  Do not look at plan.md.
-->

### Files to Create

- `backend/src/db/schema/user.ts` - Drizzle table definition for `user` (columns as specified in Domain Rules above; `role` and `deletion_status` as Postgres enums via `pgEnum`).
- `backend/src/db/schema/guest-session.ts` - Drizzle table definition for `guest_session`, including the `status` enum and a partial unique index on `converted_to_user_id` (where not null) to prevent double-convert.
- `backend/src/db/schema/plant.ts` - Drizzle table definition for `plant`, FK to `user` and (nullable) `species`.
- `backend/src/db/schema/species.ts` - Drizzle table definition for `species`, including the `care_guide` jsonb column (typed via a Zod schema or TS interface for the jsonb shape, even before `shared/` Zod contracts land in T-013 — a local interface is acceptable here as a placeholder T-013 can replace).
- `backend/src/db/schema/photo.ts` - Drizzle table definition for `photo`.
- `backend/src/db/schema/scan.ts` - Drizzle table definition for `scan`, including the `type`/`status` enums, the confidence `CHECK` constraint, and the exactly-one-owner `CHECK` constraint.
- `backend/src/db/schema/index.ts` - Barrel export re-exporting all schema modules for use by Drizzle's client and by other backend modules.
- `backend/drizzle.config.ts` - Drizzle Kit config pointing `schema` at `backend/src/db/schema/index.ts`, `out` at `backend/src/db/migrations/`, `dialect: 'postgresql'`, reading `DATABASE_URL` from `.env`.
- `backend/src/db/client.ts` - Drizzle client factory (`drizzle(pool, { schema })`) using a `pg` connection pool configured from `DATABASE_URL`.
- `backend/src/db/schema/schema.test.ts` (or `backend/test/schema.test.ts` if the project's colocated convention places integration tests under a sibling `test/` dir — colocate next to `client.ts`/schema per the "colocated" testing standard) - Vitest + Supertest-style integration test (direct DB queries, no HTTP layer needed here) that: (a) inserts two distinct users each with their own `plant`/`scan` rows, (b) asserts a query scoped by `user_id = A` never returns user B's rows (tenancy isolation gate), (c) asserts inserting a `scan` with `confidence < 0.70` and a non-null `species_id` is rejected by the DB (CHECK constraint), (d) asserts inserting a `scan` with both `user_id` and `guest_session_id` set (or both null) is rejected by the DB (CHECK constraint).

### Files to Update (REQUIRED)

- `backend/src/db/seed.ts` - Replace the placeholder schema-module stubs added in T-004 (the `// TODO(T-010...)` comments) with real imports from `backend/src/db/schema/species.ts` (for `seedSpecies()`) and `backend/src/db/schema/user.ts` (for `seedAdmin()`), so the seed script now compiles against real tables for these two entities (tiers/app_config imports remain stubbed until T-011/T-012 land).
- `backend/package.json` - Add `"db:generate": "drizzle-kit generate"` and `"db:migrate": "drizzle-kit migrate"` scripts (and `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg` to dependencies/devDependencies) if not already present from an earlier task.

### Code/Logic Requirements

- Every FK from a child table to `user` must be named `user_id` (not e.g. `owner_id`) for consistency with the tenancy-scoping convention used across the whole codebase.
- `public_id` columns must have a unique index/constraint and a default (e.g. `gen_random_uuid()` via Postgres `pgcrypto`/`uuid-ossp`, or generated in application code at insert time — pick one approach and apply it consistently across all tables in this task).
- Do not add the `subscription_tier_id` FK constraint or `usage_record_id` FK constraint in this task (those tables don't exist yet) — add the raw ulid columns without FK constraints now if included at all, or omit and note that T-011 will `ALTER TABLE ... ADD COLUMN` them (prefer omitting per expand_contract migration strategy — smaller, focused migrations per task).
- The tenancy isolation test must actually run two separate query executions scoped by different `user_id` values and assert on the result sets — not merely assert the schema *has* a `user_id` column.

## 🔌 Wiring Checklist

<!--
  Check all that apply. If any are checked, the "Files to Update" section
  MUST contain the corresponding file.

  Use the section matching your platform. Skip sections that don't apply.
-->

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → Registered in main app/router file
- [ ] **Frontend page** → Added to app router configuration
- [ ] **Navigation** → Link added to sidebar/nav component
- [ ] **API endpoint** → Frontend store/hook calls this endpoint
- [ ] **Component** → Rendered by a parent component

### Shared (All Platforms)
- [x] **Database model** → Migration created (Drizzle Kit migration generated from the schema files above, applied via `db:migrate`)
- [ ] **Environment var** → Added to .env.example (no new env vars — `DATABASE_URL` already exists from T-001)
- [ ] **API client** → Endpoint added to service layer

## ✅ Verification

**Command**: `cd backend && npm run db:generate && npm test -- schema`
**Success Criteria**: `db:generate` produces a new migration file with no errors; `npm test -- schema` runs the schema integration tests (tenancy isolation + both CHECK constraints) and all assertions pass.

### Integration Verification (if wiring items checked)

```bash
# Apply the generated migration against the local Postgres (docker-compose service from T-001) and confirm it succeeds:
cd backend && npm run db:migrate

# Re-run the schema tests against the migrated database to confirm constraints are live:
cd backend && npm test -- schema --run
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
