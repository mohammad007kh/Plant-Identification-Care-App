# Task: T-001 - Scaffold Repo Layout and Local Infra

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Foundational (no user story — enables all US1-US9)
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
- Implementation start:  2026-07-24T20:20:24Z by claude:opus-4-8
- Implementation end:    2026-07-24T20:21:44Z by claude:opus-4-8
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
| `architecture.layers` | N/A (feature-module boundaries inside a single NestJS app) |
| `code_patterns.data_access` | repository |
| `code_patterns.error_handling` | exceptions (mapped to RFC7807 responses) |
| `code_patterns.validation_approach` | schema (Zod, shared package) |
| `database.tenancy_model` | single_tenant (every user-owned row carries `user_id`) |
| `conventions.files` | kebab-case |
| `conventions.variables` | camelCase |

### Domain Rules (from subagent/station)

- **Stack**: TypeScript everywhere. Backend = NestJS (`backend/`). Frontend = Next.js App Router (`frontend/`). Shared Zod contracts + inferred types in `shared/`. Data layer = Drizzle ORM over PostgreSQL. Async/scheduling = Redis + BullMQ. UI = MUI + Emotion (RTL via stylis-plugin-rtl). Validation = Zod. Testing = Vitest + Supertest + Playwright, 80% coverage target, colocated tests.
- **Repo layout**: simple two-app layout (`frontend/`, `backend/`) plus a lightweight `shared/` package — no monorepo build tool (no Turborepo/Nx). Root `package.json` provides top-level dev/build/test scripts that delegate into each package.
- **Local infra**: v1 runs entirely under Docker Compose locally. Services needed: `postgres` (primary DB), `redis` (cache + BullMQ broker), `minio` (S3-compatible object storage standing in for ArvanCloud in production), `mailpit` (local SMTP catcher standing in for the Iranian SMTP relay used in production).
- **Secrets**: env-files only (`.env`, gitignored). Ship a `.env.example` documenting every variable with safe non-secret placeholder values — this is the only source of truth for what env vars the app needs.
- **Tenancy**: every user-owned DB row will carry a `user_id` column (enforced in later schema tasks) — no cross-user reads. Not directly exercised by this task, but the Docker Compose Postgres service is the foundation it will run on.
- **Domain primitives** (for later tasks, established here as constants convention): money = integer minor units; time = UTC (`timestamptz`); IDs = ULID internally with opaque UUID `public_id` exposed externally.

### API Context (from contracts/)

Not applicable — this is a pure scaffolding/infra task. No endpoints are implemented here.

### Feature Summary

A Persian/RTL web app (Next.js + NestJS + Postgres/Drizzle + Redis/BullMQ) that identifies plants from a leaf photo via an AI provider (behind a confidence gate), lets registered users track plants and chat about them, meters every AI action through an append-only credit ledger tied to subscription tiers (mock Zarinpal payments), sends care reminders, and exposes an admin panel — all running locally under Docker Compose for v1.

### Gate Criteria (from subagent/station)

- [ ] `frontend/`, `backend/`, `shared/` directories exist with a minimal valid package skeleton each (a `package.json` at minimum; TypeScript config where applicable).
- [ ] `docker-compose.yml` at repo root defines exactly the services: `postgres`, `redis`, `minio`, `mailpit` (additional app services may be added by later tasks, not this one).
- [ ] `.env.example` exists at repo root and documents every env var referenced by `docker-compose.yml`.
- [ ] Root `package.json` exposes `dev`, `build`, and `test` scripts.
- [ ] `docker compose config -q` succeeds (valid compose file).

---

## 🎯 Objective

Scaffold the initial repository layout (`frontend/`, `backend/`, `shared/` package skeletons) and the local development infrastructure (Docker Compose services: postgres, redis, minio, mailpit), plus a root-level `.env.example` and root `package.json` with top-level `dev`/`build`/`test` scripts. This is the foundation every subsequent task builds on — no functional code yet.

## 🛠️ Implementation Details

<!--
  CONTEXT PINNING:
  This section contains ALL the info needed to write code.
  Do not look at plan.md.
-->

### Files to Create

- `package.json` (repo root) - Root manifest with `dev`, `build`, `test` scripts that delegate to `frontend`/`backend` (e.g. via `npm run --workspace` or simple `cd`-based scripts); declare npm workspaces `["frontend", "backend", "shared"]` if using npm workspaces (simplest option given "no monorepo tooling" constraint — npm workspaces is not extra build tooling, just package resolution).
- `docker-compose.yml` (repo root) - Defines services: `postgres` (image `postgres:16-alpine`, env `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, volume, port `5432:5432`), `redis` (image `redis:7-alpine`, port `6379:6379`), `minio` (image `minio/minio`, ports `9000:9000`/`9001:9001`, command `server /data --console-address ":9001"`, env `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, volume), `mailpit` (image `axllent/mailpit`, ports `8025:8025` (web UI) / `1025:1025` (SMTP)). All services use named volumes for persistence except mailpit.
- `.env.example` (repo root) - Documents every variable consumed by `docker-compose.yml` and anticipated app config: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `REDIS_URL`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_ENDPOINT`, `MINIO_BUCKET`, `SMTP_HOST`, `SMTP_PORT`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV`. Use clearly-fake placeholder values (e.g. `postgres`, `changeme-in-.env`) — never real secrets.
- `frontend/package.json` - Minimal Next.js app manifest skeleton (name `frontend`, `private: true`, placeholder `dev`/`build`/`start` scripts to be filled in by T-003).
- `backend/package.json` - Minimal NestJS app manifest skeleton (name `backend`, `private: true`, placeholder `start:dev`/`build`/`test` scripts to be filled in by T-002).
- `shared/package.json` - Minimal shared package manifest skeleton (name `shared`, `private: true`, `main`/`types` pointing at a future `dist`, to be filled in by T-013).
- `.gitignore` (repo root, if not already present) - Ensure `.env`, `node_modules/`, `dist/`, `.next/` are ignored.

### Files to Update (REQUIRED)

- None — this is the first task; there is nothing pre-existing to wire into. (This is intentional: T-001 has no wiring checklist items because it only establishes empty skeletons that later tasks populate and wire.)

### Code/Logic Requirements

- `docker-compose.yml` must be valid Compose v2 syntax (no `version:` key required on modern Compose; if included, use a schema Docker Compose still accepts).
- Every service must expose the ports needed for local host access (Postgres 5432, Redis 6379, MinIO 9000/9001, Mailpit 8025/1025).
- `.env.example` must have one line per variable, `KEY=placeholder_value` format, no real credentials.
- Root `package.json` scripts must not fail on an empty/skeleton `frontend`/`backend` (e.g. `"dev": "echo 'run npm run dev in frontend/ and backend/ separately, or use docker compose'"` is acceptable as a placeholder until T-002/T-003 populate real scripts — but prefer wiring `concurrently` if trivial; do not over-engineer this task).
- Do not add real dependencies to `frontend/package.json` / `backend/package.json` / `shared/package.json` yet beyond `private: true` and a `name` field — later tasks (T-002, T-003, T-004, T-013) own installing their actual dependencies.

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

None of the above apply to this task — it produces skeletons and infra config only, consumed by subsequent tasks (T-002, T-003).

## ✅ Verification

**Command**: `docker compose config -q && test -f .env.example && echo OK`
**Success Criteria**: Command prints `OK` with no errors — confirms `docker-compose.yml` is syntactically valid and `.env.example` exists.

### Integration Verification (if wiring items checked)

Not applicable (no wiring items checked for this task).

```bash
# Verify the compose file parses and required files exist
docker compose config -q && test -f .env.example && echo OK

# Verify root package.json declares the required scripts
node -e "const p=require('./package.json'); ['dev','build','test'].forEach(s => { if(!p.scripts || !p.scripts[s]) { console.error('missing script: '+s); process.exit(1); } }); console.log('scripts OK');"
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
