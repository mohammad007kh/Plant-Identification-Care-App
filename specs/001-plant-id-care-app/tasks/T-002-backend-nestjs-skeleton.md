# Task: T-002 - Backend NestJS Skeleton

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Foundational (no user story — enables all backend work)
**Requirement**: N/A — Infrastructure task, no direct FR

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
| `architecture.layers` | N/A (NestJS feature modules) |
| `code_patterns.data_access` | repository |
| `code_patterns.error_handling` | exceptions → mapped to RFC7807 (`application/problem+json`) responses |
| `code_patterns.validation_approach` | schema (Zod, via shared package once T-013 lands; this task only needs a config schema) |
| `database.tenancy_model` | single_tenant (every user-owned query scoped by `user_id`) — not exercised in this task but the app-wide convention |
| `conventions.files` | kebab-case (e.g. `problem.filter.ts`, `app-config.module.ts`) |
| `conventions.variables` | camelCase |

### Domain Rules (from subagent/station)

- **Stack**: NestJS on Node 22 LTS, TypeScript 5.x strict mode. API versioning is URL-based: all routes are mounted under a global `/v1` prefix (registry: `api.versioning: url`).
- **Error format**: `api.error_format: rfc7807`. Every unhandled/handled exception must be serialized as an RFC7807 Problem Details object: `{ type, title, status, detail, requestId }`, with content-type `application/problem+json`. This is implemented as a single global NestJS exception filter — no ad-hoc error shapes elsewhere in the codebase.
- **Config**: `infrastructure.secrets: env-files` — config is read from `.env` via a NestJS `ConfigModule` (global), validated against expected keys at startup (fail fast with a clear error if a required var is missing), never hardcoded.
- **Logging**: `error_handling.logging_format: structured` — use structured (JSON) logging, not plain console strings, even in this skeleton (Nest's built-in Logger is acceptable if configured for structured output, or pino via `nestjs-pino` — pick the simplest option that satisfies "structured"; do not over-engineer this task with a full observability stack).
- **Health endpoint**: needed by Docker Compose healthchecks and later CI; must report `{ status: "ok" }` (or richer) at `GET /v1/health` with no auth required.
- **Repo layout**: this task operates inside `backend/` (scaffolded as an empty skeleton by T-001). `backend/src/modules/*` will house feature modules (auth, users, guests, plants, scans, ai-gateway, credits, chat, subscriptions, payments, notifications, catalog, admin) in later tasks — this task only creates `backend/src/main.ts`, `backend/src/app.module.ts`, and `backend/src/common/` (filters + config). Do NOT create feature modules yet — that's out of scope and belongs to later tasks (T-010+).

### API Context (from contracts/)

```yaml
# Relevant endpoint for this task (all others are implemented by later tasks)
GET /v1/health → returns { status: "ok" } (or similar), no auth required, used for Docker healthchecks and smoke tests.
```

Full OpenAPI note: the contract's `servers: - url: /v1` confirms the global prefix requirement; `security: [bearerAuth: []]` is the app-wide default but must NOT apply to the health endpoint (health has no `security` override needed since it's infra-only and not part of the documented contract, but must remain unauthenticated in practice).

### Feature Summary

A Persian/RTL web app that identifies plants from a leaf photo via an AI provider, tracks plants over time, and meters AI usage on a credit system — built as a NestJS modular monolith API + Next.js frontend. This task lays down the NestJS application shell everything else plugs into.

### Gate Criteria (from subagent/station)

- [ ] All API routes are served under the `/v1` prefix (`app.setGlobalPrefix('v1')` or equivalent).
- [ ] A global exception filter converts thrown exceptions (Nest `HttpException` and unhandled errors) into RFC7807 `application/problem+json` responses with `type`, `title`, `status`, `detail`, `requestId` fields.
- [ ] Config is loaded via a NestJS `ConfigModule` reading from `.env` (referencing `.env.example` keys from T-001), not hardcoded values.
- [ ] `GET /v1/health` returns HTTP 200 with a body indicating healthy status, and requires no authentication.
- [ ] `npx tsc --noEmit` passes with zero errors under `backend/`.

---

## 🎯 Objective

Stand up the NestJS application skeleton: bootstrap (`main.ts`) with a global `/v1` prefix, a global `ConfigModule`, a global RFC7807 exception filter, and an unauthenticated health-check endpoint — the base every feature module (auth, scans, credits, etc.) will be registered into later.

## 🛠️ Implementation Details

<!--
  CONTEXT PINNING:
  This section contains ALL the info needed to write code.
  Do not look at plan.md.
-->

### Files to Create

- `backend/src/main.ts` - NestJS bootstrap: creates the app via `NestFactory.create(AppModule)`, calls `app.setGlobalPrefix('v1')`, registers the global `ProblemDetailsFilter` (`app.useGlobalFilters(new ProblemDetailsFilter())`), enables a global `ValidationPipe` (whitelist/strip unknown props) as a baseline even though full Zod validation lands in T-013, and calls `app.listen(process.env.PORT ?? 3001)`.
- `backend/src/app.module.ts` - Root `AppModule`: imports the global `AppConfigModule` (from `common/config/`) and a `HealthModule`/`HealthController` (can be declared inline in this file or as `backend/src/health/health.controller.ts` — keep it simple, a single controller is fine for this skeleton task).
- `backend/src/common/filters/problem.filter.ts` - `ProblemDetailsFilter implements ExceptionFilter`: catches `HttpException` and generic `Error`, maps to `{ type: string (a URI or 'about:blank'), title: string, status: number, detail: string, requestId: string }`, sets `Content-Type: application/problem+json`, and returns the appropriate HTTP status code (from `HttpException.getStatus()` or 500 for unknown errors). Generates/reads `requestId` from a request header (`x-request-id`) if present, else generates one (e.g. via `crypto.randomUUID()`).
- `backend/src/common/config/app-config.module.ts` - A global `@Module` wrapping NestJS `ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] })`; validates presence of required keys (`DATABASE_URL`, `REDIS_URL`, `NODE_ENV`) at startup via a `validate` function, throwing a clear startup error if any required key is missing.
- `backend/src/health/health.controller.ts` - `HealthController` with `@Get('health')` (resolves to `/v1/health` given the global prefix) returning `{ status: 'ok', timestamp: <ISO8601 UTC> }`; explicitly marked with `@Public()` or equivalent — for this task (no auth guard exists yet), simply ensure no guard is applied so the route is reachable without a token.
- `backend/tsconfig.json` - Strict TypeScript config (`strict: true`, `strictNullChecks: true`) per registry `code_patterns.null_handling: strict_null`; target `ES2022`/`Node16`+ module resolution appropriate for Nest.
- `backend/nest-cli.json` - Standard Nest CLI config pointing `src` as source root.

### Files to Update (REQUIRED)

- `backend/package.json` - Add real dependencies (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/config`, `reflect-metadata`, `rxjs`, `typescript`, `ts-node`) and replace the T-001 placeholder scripts with real ones: `"start:dev": "nest start --watch"`, `"build": "nest build"`, `"test": "vitest"` (Vitest wiring finalized in T-004, but the script should exist now pointing at a runnable command).
- `package.json` (repo root) - Update the root `dev`/`build`/`test` scripts (placeholders from T-001) to actually invoke the now-real `backend` scripts (e.g. `"dev": "npm run start:dev --workspace=backend"` or a `concurrently` call once `frontend` also has real scripts in T-003).

### Code/Logic Requirements

- Global prefix: `app.setGlobalPrefix('v1')` must be called before `app.listen()`.
- Exception filter must be registered globally (`app.useGlobalFilters(...)`), not per-controller, so every future feature module automatically inherits RFC7807 error formatting.
- Health endpoint must return HTTP 200 and a JSON body whose `status` field equals `"ok"` — this exact shape is asserted by the verification command below via `jq`.
- Config validation must fail the process at startup (not silently continue) if a required env var is absent — "fail fast" per user's global error-handling standard.
- No feature modules (auth, scans, credits, etc.) are created in this task — only the app shell, config, filter, and health check. Adding unrelated modules here would violate the "atomic task" scope.

## 🔌 Wiring Checklist

<!--
  Check all that apply. If any are checked, the "Files to Update" section
  MUST contain the corresponding file.

  Use the section matching your platform. Skip sections that don't apply.
-->

### Web (React/Vue/Next.js/etc.)
- [x] **Backend route** → Registered in main app/router file (health route registered via `HealthController` imported into `AppModule`, which is bootstrapped in `main.ts`)
- [ ] **Frontend page** → Added to app router configuration
- [ ] **Navigation** → Link added to sidebar/nav component
- [ ] **API endpoint** → Frontend store/hook calls this endpoint
- [ ] **Component** → Rendered by a parent component

## ✅ Verification

**Command**: `cd backend && npx tsc --noEmit`
**Success Criteria**: Exits with code 0 and no type errors printed.

### Integration Verification (if wiring items checked)

```bash
# Start the backend (in a separate terminal/background), then verify the health route:
cd backend && npm run start:dev &
sleep 3
curl -s http://localhost:3001/v1/health | jq '.status=="ok"'
# Expected output: true
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
