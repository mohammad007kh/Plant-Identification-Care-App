# Task: T-013 - Shared Zod Contracts and Backend App Config Service

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US1, US9 (cross-cutting contracts + admin-configurable file types)
**Requirement**: FR-005

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
- Implementation start: 2026-07-24T22:02:03Z by claude:opus-4-8
- Implementation end: 2026-07-26T11:07:10Z by claude:opus-4-8
- verify-depth: light

## 📋 Embedded Context (READ THIS FIRST)

<!--
  SELF-CONTAINED TASK (Constitution Directive 8):
  This section contains ALL context needed to implement this task.
  Do NOT read plan.md, spec.md, stations, or subagents.

  If this section is empty or insufficient, report as task quality issue.
-->

### Project Standards (from registry)

| Key                                 | Value                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `architecture.pattern`              | modular_monolith                                                                            |
| `code_patterns.validation_approach` | schema (Zod) — this task IS the schema layer                                                |
| `frontend.validation_library`       | zod                                                                                         |
| `frontend.form_library`             | react-hook-form (consumes these Zod schemas in later frontend tasks)                        |
| `api.error_format`                  | rfc7807 (validation failures surfaced as RFC7807 problems by the backend filter from T-002) |
| `conventions.files`                 | kebab-case (e.g. `scan.contract.ts`, `app-config.service.ts`)                               |
| `conventions.variables`             | camelCase                                                                                   |

### Domain Rules (from subagent/station)

- **Requirement FR-005** (exact text from spec.md): "Admins MUST be able to configure the allowed photo file types/formats, and changes MUST take effect on subsequent uploads without a code deployment." This task implements the **read side**: a backend `AppConfigService` that reads the `app_config` table (from T-012) at request time — no caching that would prevent same-deploy config changes from taking effect, or a very short TTL cache with explicit invalidation, so an admin's `PATCH /v1/admin/config` change (implemented by a later admin task) is reflected on the next upload without restarting the process.
- **Shared contracts purpose**: `shared/` is a lightweight TypeScript package (no monorepo build tool) exporting Zod schemas + their inferred types for every DTO crossing the API boundary, consumed by both `backend/` (request validation via NestJS pipes) and `frontend/` (React Hook Form resolvers + TanStack Query response typing). This is the single source of truth for shapes — neither app hand-rolls its own duplicate interface for the same wire shape.
- **Contract domains to cover** (per data-model.md entities and contracts/openapi.yaml schemas), one Zod schema module per domain:
  - `auth`: register/login request bodies (email, password — string min-length per `security.password_policy: strong`), auth response shape.
  - `scan`: `ScanJob` (mirrors the OpenAPI `ScanJob` schema: `id` uuid, `type` enum(identify,comparison), `status` enum(pending,completed,failed), `confidence` nullable number, `species` nullable object, `careGuide` nullable object, `lowConfidence` boolean), scan-submission request shape.
  - `plant`: `Plant` (mirrors OpenAPI: `id` uuid, `nickname` nullable string, `species` nullable object, `photos` array), plant-creation/update request shapes.
  - `credit`: `CreditBalance` (mirrors OpenAPI: `balance` integer, `tier` enum(free,pro,max)).
  - `plan`: `Plan` (mirrors OpenAPI: `id` uuid, `key` enum(free,pro,max), `monthlyCreditAllowance` integer, `priceMinor` integer, `currency` string).
  - `chat`: chat-message request/response shapes (content string, contextPhotoIds array max 2 — mirroring the `chat_message.context_photo_ids` DB constraint from T-012).
  - `admin`: `app_config` value shapes — specifically a Zod schema for the "allowed photo file types" config value (an array of MIME-type strings) and a Zod schema for "per-action credit costs" (a record keyed by action name to integer cost) — these two are exactly what `AppConfigService` reads and validates.
  - Common: a `Problem` schema mirroring the OpenAPI RFC7807 `Problem` schema (`type`, `title`, `status`, `detail`, `requestId`), and a `CursorPage<T>` generic pagination envelope schema (mirrors OpenAPI `CursorPage`: `data` array, `nextCursor` nullable string).
- **Money/time/id conventions carried into contracts**: money fields (e.g. `priceMinor`) are `z.number().int()` (minor units, never floats); timestamps are ISO8601 strings (UTC) validated via `z.string().datetime()`; externally-exposed ids are `z.string().uuid()` (never the internal ULID).
- **`AppConfigService`**: backend-only (not part of `shared/`), lives in `backend/src/common/config/app-config.service.ts`. Exposes typed getters, e.g. `getAllowedPhotoFileTypes(): Promise<string[]>` and `getCreditCosts(): Promise<Record<'identify'|'chat'|'comparison', number>>`, each reading the corresponding `app_config` row by `key`, parsing `value` (jsonb) through the matching Zod schema from `shared/`, and throwing a clear validation error (surfaced as an RFC7807 500, since a malformed config row is an operator error, not a client error) if the stored jsonb no longer matches the expected shape — this ensures schema drift in `app_config.value` is caught immediately rather than silently propagating bad config to uploads.

### API Context (from contracts/)

```yaml
# Config this task's AppConfigService reads (write side implemented by a later admin task)
GET /v1/admin/config → read operational config
PATCH /v1/admin/config → "Update config (allowed file types, per-tier credit allowances, credit costs, notification templates/timing) — applies without deploy."

# Shapes this task's Zod contracts formalize (mirrored 1:1 from openapi.yaml components.schemas)
Problem, CursorPage, ScanJob, Plant, Plan, CreditBalance
```

### Feature Summary

A Persian/RTL web app where every DTO crossing the frontend/backend boundary is validated against a single shared Zod schema, and where admin-configurable operational settings (starting with allowed photo upload file types, per FR-005) take effect immediately without a deploy. This task builds both halves: the `shared/` contracts package and the backend's `AppConfigService` read path.

### Gate Criteria (from subagent/station)

- [ ] `shared/` exports a Zod schema (and inferred TS type) for every DTO domain listed above (auth, scan, plant, credit, plan, chat, admin, plus `Problem`/`CursorPage`).
- [ ] `AppConfigService.getAllowedPhotoFileTypes()` reads live from the `app_config` table (no build-time hardcoding of the allowed-types list anywhere in the codebase).
- [ ] A malformed `app_config.value` (failing its Zod schema) causes `AppConfigService` to throw rather than silently return an invalid/undefined config.
- [ ] `npx tsc --noEmit` passes with zero errors under `shared/`.
- [ ] This task has **no web wiring checklist** — it is a `shared`-target task (a library consumed by other tasks, not a user-facing route/page).

---

## 🎯 Objective

Build the `shared/` package of Zod contract schemas (with inferred TypeScript types) for every DTO domain the API exposes (auth, scan, plant, credit, plan, chat, admin, plus common `Problem`/`CursorPage` envelopes), and implement the backend's `AppConfigService`, which reads the `app_config` table (from T-012) at request time — starting with the allowed-photo-file-types setting — so admin changes take effect without a code deployment, satisfying the read side of FR-005.

## 🛠️ Implementation Details

<!--
  CONTEXT PINNING:
  This section contains ALL the info needed to write code.
  Do not look at plan.md.
-->

### Files to Create

- `shared/src/contracts/common.ts` - `problemSchema` (RFC7807 shape) and `cursorPageSchema<T>(itemSchema)` (a function returning a Zod schema parameterized by item type — mirrors `CursorPage` from OpenAPI).
- `shared/src/contracts/auth.ts` - `registerRequestSchema`, `loginRequestSchema` (email + password, password meeting the "strong" policy — e.g. min 8 chars, at least one letter and one digit).
- `shared/src/contracts/scan.ts` - `scanJobSchema` (mirrors OpenAPI `ScanJob`) and `submitScanRequestSchema` (describes the non-file fields of the multipart request, since the binary photo itself isn't a Zod-validated field).
- `shared/src/contracts/plant.ts` - `plantSchema` (mirrors OpenAPI `Plant`), `savePlantRequestSchema`, `updatePlantRequestSchema`.
- `shared/src/contracts/credit.ts` - `creditBalanceSchema` (mirrors OpenAPI `CreditBalance`).
- `shared/src/contracts/plan.ts` - `planSchema` (mirrors OpenAPI `Plan`).
- `shared/src/contracts/chat.ts` - `chatMessageRequestSchema` (`content: z.string().min(1)`, `contextPhotoIds: z.array(z.string().uuid()).max(2)`), `chatMessageSchema` (response shape including `role` enum(user,assistant)).
- `shared/src/contracts/admin.ts` - `allowedPhotoFileTypesConfigSchema` (`z.array(z.string())`, e.g. validating each entry looks like a MIME type via `z.string().regex(/^[-\w.]+\/[-\w.+]+$/)`), `creditCostsConfigSchema` (`z.record(z.enum(['identify','chat','comparison']), z.number().int().nonnegative())`).
- `shared/src/contracts/index.ts` - Barrel export re-exporting every contract module and their inferred types (e.g. `export type ScanJob = z.infer<typeof scanJobSchema>`).
- `shared/src/index.ts` - Package entry point re-exporting `./contracts`.
- `shared/tsconfig.json` - Strict TypeScript config producing declaration files (`declaration: true`, `outDir: dist`) so `backend/` and `frontend/` can consume `shared/` as a typed local dependency.
- `backend/src/common/config/app-config.service.ts` - `AppConfigService` (injectable NestJS provider): `getAllowedPhotoFileTypes(): Promise<string[]>` and `getCreditCosts(): Promise<Record<string, number>>`, each: (1) queries `app_config` by the relevant `key` (e.g. `'allowed_photo_file_types'`, `'credit_costs'`) via the Drizzle client from T-010, (2) parses the row's `value` jsonb through the matching Zod schema imported from `shared/`, (3) throws a descriptive error if the row is missing or fails validation (do not return a silent default — a missing/malformed config row is an operator error that must be visible, not masked).
- `backend/src/common/config/app-config.service.test.ts` (colocated) - Vitest test seeding a valid `app_config` row, asserting `getAllowedPhotoFileTypes()` returns the parsed array; seeding an intentionally malformed row (e.g. `value: { not: "an array" }`), asserting the service throws; asserting no row present also throws (rather than returning `[]`/`undefined` silently).

### Files to Update (REQUIRED)

- `backend/src/common/config/app-config.module.ts` (created in T-002) - Register `AppConfigService` as a provider and export it, so other feature modules (e.g. the T-014 upload validator) can inject it.
- `backend/package.json` - Add `shared` as a local/workspace dependency (e.g. `"shared": "*"` resolved via npm workspaces from T-001, or a relative `file:../shared` reference if workspaces aren't used) plus `zod` itself as a dependency.
- `frontend/package.json` - Add `shared` as a local/workspace dependency plus `zod`, so later frontend form tasks can import the same schemas (no functional frontend change in this task, but the dependency wiring belongs here since this task is what makes `shared/` consumable).
- `backend/src/db/seed.ts` - No further stub replacement needed for `seedAppConfig()` beyond what T-012 already wired (that task's seed values are the ones this task's `AppConfigService` reads) — however, update the seeded `value` shape if needed so it validates cleanly against `allowedPhotoFileTypesConfigSchema`/`creditCostsConfigSchema` (i.e. confirm the T-012 seed data is schema-compatible with this task's Zod schemas, adjusting either side if there's a mismatch).

### Code/Logic Requirements

- Every Zod schema in `shared/` must have its TS type derived via `z.infer<...>` and re-exported — never hand-write a parallel `interface` that could drift from the schema.
- `AppConfigService` must not hardcode any file-type list, credit cost, or other operator-configurable value as a fallback default in code — if the DB row is absent, that is a seed/ops gap to surface loudly (throw), not paper over.
- This task does not implement the admin `PATCH /v1/admin/config` write endpoint (a later admin-module task) — only the read side described above.
- This task does not implement upload validation itself (T-014 consumes `AppConfigService.getAllowedPhotoFileTypes()` — this task only provides that method).

## 🔌 Wiring Checklist

<!--
  Check all that apply. If any are checked, the "Files to Update" section
  MUST contain the corresponding file.

  Use the section matching your platform. Skip sections that don't apply.
-->

This task targets `shared/` (a library package) plus a backend-internal service with no HTTP route of its own — per the task-generation instructions, a `shared`-target task carries **no web wiring checklist**. The consuming wiring (an actual upload endpoint calling `getAllowedPhotoFileTypes()`) is deferred to T-014, which will check its own "Backend route"/"API endpoint" items and list `app-config.module.ts` under its Files to Update if further registration is needed there.

## ✅ Verification

**Command**: `cd shared && npx tsc --noEmit`
**Success Criteria**: Exits with code 0 and no type errors across all contract modules.

### Integration Verification (if wiring items checked)

Not applicable (no wiring items checked for this task). For completeness, the `AppConfigService` behavior is verified directly:

```bash
cd backend && npm test -- app-config.service --run
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
