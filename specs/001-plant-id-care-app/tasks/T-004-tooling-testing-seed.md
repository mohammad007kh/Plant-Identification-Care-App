# Task: T-004 - Tooling, Testing Config, and Seed Script

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Foundational (no user story — enables quality gates for all subsequent tasks)
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
- Implementation start:  2026-07-24T20:43:21Z by claude:opus-4-8
- Implementation end:    2026-07-24T20:47:53Z by claude:opus-4-8
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
| `architecture.layers` | N/A |
| `code_patterns.data_access` | repository |
| `code_patterns.error_handling` | exceptions → RFC7807 (already wired in T-002; this task only lints/type-checks it) |
| `code_patterns.validation_approach` | schema (Zod) |
| `database.tenancy_model` | single_tenant |
| `conventions.files` | kebab-case |
| `conventions.variables` | camelCase |

### Domain Rules (from subagent/station)

- **Testing stack** (registry `testing.*`): Vitest (unit), Supertest (API integration), Playwright (E2E on critical flows), MSW for network mocking, **80% coverage target**, tests colocated with source (not in a separate top-level `tests/` tree).
- **Tooling** (plan.md "Coding Standards → Tooling"): ESLint with `typescript-eslint` recommended rules + Prettier for formatting; `tsc` in strict mode (`strictNullChecks`) as the type-checking gate. Pre-commit hook runs lint + typecheck on staged files (Husky + lint-staged is the standard combo for this).
- **Seed data purpose**: the app needs deterministic local dev/test data before feature work can be manually verified: the three subscription tiers (`free`, `pro`, `max` — referencing the `subscription_tier` entity that ships in T-011), one demo admin user (`role: admin`), a handful of sample `species` catalog rows (referencing T-010's `species` table), and sensible `app_config` defaults (allowed photo file types, per-action credit costs — referencing T-013's config service and the `app_config` table from T-012). **This task only creates the seed script skeleton and its structure** — it must be written defensively (guarded behind checks for table existence, or simply left as a documented skeleton with clear TODOs) since the schema tables it seeds (`T-010`, `T-011`, `T-012`) may not exist yet at the time this task runs, per the dependency graph (`T-004` depends only on `T-002`/`T-003`, not on the schema tasks). Do not block this task on schema existing — write the seed script's shape/structure now; it will be filled in / run for real once schemas land.
- **Coverage gate**: Vitest config must set a global coverage threshold of 80% (statements/branches/functions/lines) so CI (when added later) and local `npm test -- --coverage` enforce it consistently.
- **Commit convention**: Conventional Commits (registry `conventions.commits: conventional`) — the pre-commit hook itself does not need to enforce commit *message* format in this task (that would require commitlint, out of scope here); it only needs to run lint + typecheck on staged files before allowing a commit.

### API Context (from contracts/)

Not applicable — this task is pure tooling/config plus a seed script skeleton; no API endpoints are added.

### Feature Summary

A Persian/RTL web app that identifies plants from a leaf photo, tracks them over time, and meters AI usage via credits. This task establishes the shared quality bar (lint, format, strict types, test runners with an 80% coverage gate, and a pre-commit hook) plus the shape of the DB seed script that later tasks (T-010–T-013) will populate with real schema-backed data.

### Gate Criteria (from subagent/station)

- [ ] ESLint (typescript-eslint recommended) + Prettier configured at the repo root, applicable to both `backend/` and `frontend/`.
- [ ] `tsc --noEmit` strict mode passes for both `backend/` and `frontend/` (already true from T-002/T-003; this task adds the shared/root-level strict config and lint rules on top).
- [ ] Vitest config exists with an 80% global coverage threshold.
- [ ] Playwright config exists (even if no specs are written yet — config only, specs land with their features).
- [ ] A pre-commit hook (Husky) runs lint + typecheck on staged files.
- [ ] `backend/src/db/seed.ts` exists as a runnable (if currently no-op/guarded) skeleton documenting the tiers/admin/species/app_config it will seed once schemas exist.

---

## 🎯 Objective

Establish shared tooling and quality gates across the repo — ESLint + Prettier + strict `tsc`, Vitest + Supertest + Playwright configuration with an 80% coverage threshold, a Husky pre-commit hook (lint + typecheck on staged files) — and create a DB seed script skeleton (`backend/src/db/seed.ts`) documenting the tiers (free/pro/max), a demo admin, sample species, and `app_config` defaults it will populate once the corresponding schema tasks (T-010–T-013) land.

## 🛠️ Implementation Details

<!--
  CONTEXT PINNING:
  This section contains ALL the info needed to write code.
  Do not look at plan.md.
-->

### Files to Create

- `.eslintrc.cjs` (repo root) - ESLint config extending `plugin:@typescript-eslint/recommended` + `prettier` (to disable conflicting stylistic rules), with `overrides` scoping React-specific rules to `frontend/**` if needed.
- `.prettierrc.json` (repo root) - Prettier formatting config (standard opinionated defaults: semi, singleQuote, trailingComma — pick sensible values and keep consistent across `backend/` and `frontend/`).
- `.prettierignore` (repo root) - Excludes `node_modules`, `dist`, `.next`, coverage output.
- `vitest.config.ts` (repo root, or one per package if simpler — prefer a root config with `projects`/workspace-aware setup referencing `backend` and `frontend`) - Configures Vitest with `coverage: { provider: 'v8', thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 } }`, colocated test file glob (`**/*.{test,spec}.ts(x)?`), and MSW setup file reference.
- `playwright.config.ts` (repo root or `frontend/`) - Playwright config pointing at `frontend/` E2E specs (colocated under `frontend/test/` or colocated per the project's "colocated" convention), base URL `http://localhost:3000`, at least one project (`chromium`).
- `.husky/pre-commit` - Husky hook script invoking `npx lint-staged`.
- `.lintstagedrc.json` (repo root) - Maps staged file globs to commands: `"*.{ts,tsx}": ["eslint --fix", "prettier --write"]` and a typecheck step (e.g. run `tsc --noEmit` per affected package, or simply run it unconditionally since the codebase is still small).
- `backend/src/db/seed.ts` - Seed script skeleton: a `main()` function (run via `tsx backend/src/db/seed.ts` or a Drizzle-aware runner) that, when the target schemas exist, will: (1) upsert three `subscription_tier` rows (`free`, `pro`, `max` — each with a placeholder `monthly_credit_allowance` and `price_minor`, keyed by `key` to be idempotent/upsert-safe), (2) upsert one demo admin `user` row (`role: 'admin'`, a placeholder email/password hash), (3) insert a handful of sample `species` rows (e.g. 3-5 common houseplants with minimal `care_guide` jsonb), (4) upsert `app_config` defaults (allowed photo file types e.g. `["image/jpeg","image/png","image/webp"]`, and per-action credit costs for `identify`/`chat`/`comparison`). Structure this as clearly-named, independently-callable functions (`seedTiers()`, `seedAdmin()`, `seedSpecies()`, `seedAppConfig()`) called from `main()`, each guarded/commented with a `// TODO(T-011/T-012/T-013): requires <table> from <task>` note so it is honest about what it does today (a documented, structurally-correct skeleton) versus what later tasks make it fully functional against.
- `backend/package.json` - (only the `db:seed` script addition, see Files to Update below — listed here only if not already tracked; actual script wiring is a Files to Update concern since `backend/package.json` already exists from T-002).

### Files to Update (REQUIRED)

- `backend/package.json` - Add `"test": "vitest"` (superseding the T-002 placeholder), add `"db:seed": "tsx src/db/seed.ts"` (or `ts-node`, whichever the project standardizes on — `tsx` is simplest for ESM/TS), and add `tsx`/`vitest`/`@vitest/coverage-v8`/`supertest`/`msw` to devDependencies.
- `frontend/package.json` - Add `"test": "vitest"`, `"test:e2e": "playwright test"`, and add `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `msw` to devDependencies.
- `package.json` (repo root) - Update the root `test` script (placeholder from T-001) to run both packages' tests, e.g. `"test": "npm run test --workspace=backend && npm run test --workspace=frontend"`; add `"lint": "eslint ."` and `"typecheck": "npm run typecheck --workspace=backend && npm run typecheck --workspace=frontend"` (each package's own `package.json` gaining a `"typecheck": "tsc --noEmit"` script as part of this same update). Add `husky`/`lint-staged`/`eslint`/`prettier`/`typescript-eslint` to root devDependencies and a `"prepare": "husky"` script so the hook installs on `npm install`.

### Code/Logic Requirements

- Coverage thresholds must be enforced (not just reported) — Vitest's `coverage.thresholds` config fails the test run if under 80%, this is what gives the "80%+ coverage" standard teeth going forward.
- The pre-commit hook must actually block a commit when lint or typecheck fails (standard Husky/lint-staged behavior — do not suppress non-zero exit codes).
- `seed.ts` must be idempotent in design (upsert-by-natural-key, e.g. `ON CONFLICT (key) DO UPDATE` for tiers, `ON CONFLICT (email) DO NOTHING` for the admin) even though it cannot be fully exercised until T-010–T-013 land — write it correctly now rather than deferring correctness to a rewrite later.
- Do not implement the actual Drizzle schema imports with real table definitions in this task if T-010/T-011/T-012 haven't landed yet in the implementation order — however, since this task file is authored assuming implementation may happen in dependency order (T-004 before T-010+), the seed script's DB calls should be written against the *expected* schema module paths (`../db/schema/subscription-tier`, `../db/schema/user`, `../db/schema/species`, `../db/schema/app-config`) so that once those files exist (from later tasks) the seed script compiles and runs without modification. If those modules do not yet exist when this task is implemented, stub minimal placeholder exports so `tsc --noEmit` still passes, with a clear comment that T-010/T-011/T-012 will supersede the stub.

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

None of the standard web wiring items apply — this is a pure tooling/config task. The equivalent "wiring" here is the `db:seed` npm script (Files to Update, `backend/package.json`) and the root `lint`/`typecheck`/`test` scripts, both covered above.

## ✅ Verification

**Command**: `npm run lint && npm run typecheck`
**Success Criteria**: Both commands exit with code 0 — no lint errors, no type errors, across `backend/` and `frontend/`.

### Integration Verification (if wiring items checked)

```bash
# Verify the coverage-gated test runner is wired and runs (even with zero/minimal tests so far):
cd backend && npm test -- --coverage --run

# Verify the seed script at least type-checks and its entry point is callable:
cd backend && npx tsx src/db/seed.ts --dry-run 2>&1 | head -n 20 || echo "seed script invoked (expected to no-op or log TODOs pre-schema)"

# Verify the pre-commit hook file exists and is executable
test -x .husky/pre-commit && echo "PRE_COMMIT_HOOK_OK"
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
