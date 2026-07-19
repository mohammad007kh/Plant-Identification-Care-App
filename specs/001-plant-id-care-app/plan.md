# Implementation Plan: Plant Identification & Care App

**Branch**: `001-plant-id-care-app` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-plant-id-care-app/spec.md`

## Lifecycle Markers

<!--
  Script-managed. Do NOT hand-edit. (v0.3+)
  Populated by scripts/{bash,powershell}/stamp-lifecycle.{sh,ps1} during
  /atomicspec.plan. Authoring lifecycle only — plan.md is never "implemented"
  (Article IX, Directive 9). Empty section = legacy / pre-v0.3 artifact,
  treated as `legacy_closed`.
-->


- Authored start:        2026-07-19T15:28:21Z by claude:opus-4-8
- Authored end:          2026-07-19T15:45:10Z by claude:opus-4-8

## Planning Configuration

**Configured At**: 2026-07-19T15:28Z
**Detected Platform**: web

| Setting | Value |
|---------|-------|
| Platform | web (responsive, Persian / RTL) |
| Subagents | Enabled |
| Available Subagents | ai-engineer, prompt-engineer, backend-architect, metering-engineer, payment-integration, api-documenter, data-architecture, database-optimizer, sql-pro, frontend-developer, ui-ux-designer, deployment-engineer, typescript-pro, architect-reviewer, code-reviewer |
| Competitive Analysis | No |
| Review Depth | Full |

**Interview**: `interview_completed: 2026-07-19` (registry). Architectural decisions were pinned during a subagent-supervised `/atomicspec.clarify` session; this plan consumes them and resolves the remaining (testing, tokens, deploy posture, repo layout) with HITL.

## Summary

A Persian-only (RTL), responsive web app that identifies plants from a leaf photo using OpenAI (via LangChain/LangGraph) behind a swappable `PlantAIProvider`, returns a species + care guide only above a 70% confidence gate, and lets registered users track plants over time (photo history, health comparison, AI chat) under a unified **AI-credit** system. Every AI action debits an append-only credit ledger and is refunded on service failure. Three subscription tiers (Free/Pro/Max) with admin-configurable monthly allowances are purchased via a **mock Zarinpal** gateway behind a `PaymentPort`. Care reminders go out by email (primary) and best-effort web push. An admin panel manages the plant DB, misidentification reports, users, and operational config.

**Technical approach**: an end-to-end TypeScript codebase — NestJS API + Next.js (App Router) web + shared Zod contracts — with PostgreSQL (Drizzle ORM), Redis + BullMQ for async AI jobs and scheduled reminders. Money is integer minor-units; IDs are ULID internally with opaque UUID public ids; time is UTC. v1 runs locally under Docker Compose with the codebase kept portable for later cloud/VPS (ArvanCloud S3-compatible storage) deployment.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 22 LTS
**Primary Dependencies**: NestJS (API); Next.js App Router + React 18 (web); Drizzle ORM; Redis + BullMQ (queue/cache/scheduling); MUI + Emotion (RTL UI); TanStack Query; Zustand; React Hook Form + Zod; LangChain + LangGraph + OpenAI SDK (AI orchestration behind `PlantAIProvider`); nodemailer (SMTP `MailPort`); Zod (shared `contracts` package)
**Storage**: PostgreSQL (primary, via Drizzle) + Redis (cache + BullMQ) + S3-compatible object storage for photos (local MinIO in dev; ArvanCloud in production, deferred)
**Testing**: Vitest (unit), Supertest (API integration), Playwright (E2E on critical flows), MSW + Vitest mocks; **80% coverage** target; colocated tests
**Target Platform**: Web browsers (mobile-first responsive, Persian/RTL). Runtime: Node 22 in Docker Compose locally; production host (VPS/ArvanCloud) deferred
**Project Type**: web
**Performance Goals**: non-AI interactions p95 < 200 ms; AI actions run async via BullMQ with client status polling (perceived latency owned by OpenAI); comfortably supports a few thousand MAU
**Constraints**: Persian/RTL first-class; online-only (no offline); Iran-accessible / self-hostable dependencies; credit integrity (no double-spend, no double-refund) under concurrency and AI-failure; provider-swappable AI and payment layers
**Scale/Scope**: a few thousand monthly active users; ~9 user-story slices; single admin role

## Tech Stack Approval

| Decision          | Value                                   | Source   | Approved |
|-------------------|-----------------------------------------|----------|----------|
| Language/Version  | TypeScript 5.x / Node 22 LTS            | Registry | [x] |
| Primary Framework | NestJS (API) + Next.js App Router (web) | Registry | [x] |
| Storage           | PostgreSQL + Redis + S3-compatible blob | Registry | [x] |
| ORM/Data Layer    | Drizzle                                 | Registry | [x] |
| Testing Framework | Vitest + Supertest + Playwright (80%)   | Approved (this session) | [x] |
| Target Platform   | Web (responsive, Persian/RTL)           | Phase 0.1 | [x] |
| Auth method       | **JWT** (short-lived access + rotating refresh) | **Deviation — user-approved** | [x] |
| UI system         | MUI + Emotion only (minimum frameworks) | Registry + user constraint | [x] |
| Repo layout       | Simple `frontend/` + `backend/` + `shared/` | Approved (this session) | [x] |
| Deploy posture    | Local Docker Compose (cloud deferred)   | Approved (this session) | [x] |

**Assumptions Made**:

| Item | Assumed Value | Rationale |
|------|---------------|-----------|
| Testing stack | Vitest + Supertest + Playwright | End-to-end TS; Vitest fast for both apps; approved by user |
| Object storage (dev) | MinIO (S3-compatible) | Local S3 parity with ArvanCloud for production |
| CI/CD | Deferred | User chose local-first; add on cloud move |
| Error tracking | Deferred (structured logs now) | Local-first; self-hosted Sentry/GlitchTip later |
| Secrets | env-files (`.env`, gitignored) | Local dev standard; secret manager on cloud move |

**Approval Status**: Approved
**Approved By**: Founder (Full review)
**Approved At**: 2026-07-19T15:30Z
**Revisions**: auth session→JWT; UI trimmed to single framework (MUI/Emotion, no Tailwind); deploy target vps→local Docker Compose (cloud deferred); repo simplified to frontend/backend/shared (no Turborepo).

> **DEVIATION from project-registry**:
> - Key: `backend.auth_method`
> - Default: `session`
> - This feature uses: `jwt`
> - Reason: Founder preference. Mitigations required (see Security below): short-lived access token, httpOnly rotating refresh token, server-side refresh denylist for revocation, CSRF handling appropriate to token transport.
> - Approved: Human (2026-07-19)

## Coding Standards

### Naming Conventions

| Context | Convention | Example |
|---------|------------|---------|
| Variables | camelCase | `creditBalance` |
| Functions | camelCase | `debitCredit()` |
| Classes/Components | PascalCase | `AiGatewayService`, `ScanResultCard` |
| Constants | SCREAMING_SNAKE_CASE | `CONFIDENCE_THRESHOLD` |
| Files | kebab-case | `ai-gateway.service.ts`, `scan-result-card.tsx` |
| Database tables | snake_case | `credit_transactions` |
| Database columns | snake_case | `created_at` |
| API endpoints | kebab-case, plural, `/v1` | `/v1/plants`, `/v1/scan-jobs` |

### Tooling

| Tool | Configuration | Command |
|------|---------------|---------|
| Linter | ESLint (typescript-eslint) | `pnpm lint` (or `npm run lint`) |
| Formatter | Prettier | `pnpm format` |
| Type Checker | tsc (strict, `strictNullChecks`) | `pnpm typecheck` |

### Agreed Standards
- **Style**: typescript-eslint recommended + Prettier
- **Pre-commit Hooks**: Yes (lint + typecheck on staged)
- **Enforced in CI**: Deferred (local-first; enable on cloud move)
- **Commits**: Conventional Commits

**Standards Approved By**: Founder · **Standards Approved At**: 2026-07-19T15:30Z

## Tech Stack Validation

**Validation Date**: 2026-07-19
**Validation Status**: PASS_WITH_OVERRIDES

### Validation Results

| Package | Proposed | Validated | Status | Notes |
|---------|----------|-----------|--------|-------|
| (npm ecosystem) | current stable | see Overrides | WARN | Automated freshness/network validation not run in this local environment |

### Warnings

| Package | Issue | Recommendation |
|---------|-------|----------------|
| all | Registry freshness/CVE probe skipped (local-first, no network validation run) | Pin exact versions at scaffold time; run `npm audit` + `validate-tech-stack` when CI is added |

### User Overrides

| Package | Issue | User Decision | Reason |
|---------|-------|---------------|--------|
| (stack) | Freshness/CVE validation deferred | Accept | Local-first MVP; versions pinned to current LTS/stable at scaffold; automated validation deferred to the cloud/CI milestone |

**Validation Approval**: Approved (override) · **Validated By**: Founder · **Validated At**: 2026-07-19T15:30Z

## Frontend/UI Specifications

**UI Specifications Status**: Approved

### Core UI Stack

| Setting | Value | Notes |
|---------|-------|-------|
| UI Library | MUI (Material UI) + Emotion | Single UI system (minimum frameworks); strong RTL support via `stylis-plugin-rtl` |
| Design System | Minimal tokens | MUI theme backed by CSS variables (colors, spacing, typography, Vazirmatn) |
| State Management | Zustand (client) + TanStack Query (server state) | Minimal client state |
| Form Handling | React Hook Form + Zod | Shared Zod schemas from `shared/` |

### UI Features

| Feature | Enabled | Implementation Notes |
|---------|---------|----------------------|
| Dark Mode | No (deferred) | Theming layer built token-first so it's additive later |
| Responsive/Mobile | Yes | Mobile-first; browser camera/upload is a primary flow |
| Accessibility (WCAG) | Yes — AA | Focus/labels on upload, chat, forms |
| Animations | CSS only | Lean bundle for throttled networks |

### Design Tokens

| Token Category | Source | Format | Location |
|----------------|--------|--------|----------|
| Colors / Typography / Spacing | Manual (minimal) | CSS variables + MUI theme | `frontend/src/theme/` |
| Font | Self-hosted Vazirmatn (woff2) | `@font-face` | `frontend/src/theme/fonts/` |

### Component Standards

| Standard | Rule |
|----------|------|
| Component naming | PascalCase |
| File structure | Component per file; feature folders |
| Props interface | TypeScript interface |
| Default exports | Named exports preferred |
| Styling | MUI `sx` / Emotion; logical CSS properties (RTL-safe) |
| Test location | Colocated |

### Additional UI Requirements
- `dir="rtl"`, `lang="fa"` at root; logical CSS properties (`margin-inline-*`) only — no physical left/right.
- Self-hosted Vazirmatn; **no** Google Fonts CDN. Icons: lucide (bundled). Centralized Persian numeral formatter.

**Approved By**: Founder · **Approved At**: 2026-07-19T15:30Z · **Revisions**: single UI framework (no Tailwind)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **Articles I–VIII**: unfilled `[PLACEHOLDER]` in `memory/constitution.md` (project constitution not yet authored via `/atomicspec.constitution`). No project-specific principles to gate against; proceeding under **Article IX (Prime Directives)** which is active.
- **Directive 7 (Registry)**: registry present + populated; one approved deviation (`auth_method`) documented above.
- **Directive 6 (HITL)**: Phase 0.5 / 0.7 / 0.8 / 0.9 checkpoints executed (Full review).
- **Plan → Tasks gates (Directive 4)**: Stations 06 (API), 07 (Data), 08 (Auth/RBAC), 12 (CI/CD), 13 (Security) — addressed in design below; formal gate check run before `/atomicspec.tasks`.
- **Complexity**: modular monolith + simple two-app layout — no complexity-tracking violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-plant-id-care-app/
├── spec.md
├── plan.md              # this file
├── clarify-log.md
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI)
├── index.md             # (/atomicspec.tasks)
├── traceability.md      # (/atomicspec.tasks)
└── tasks/               # (/atomicspec.tasks)
```

### Source Code (repository root)

```text
backend/                         # NestJS API
├── src/
│   ├── modules/
│   │   ├── auth/                # JWT (access+refresh), email/password
│   │   ├── users/              # accounts, deletion grace, notif prefs
│   │   ├── guests/             # guest session + 2-scan limit + merge
│   │   ├── plants/             # saved plants + photo history
│   │   ├── scans/              # upload, identify, comparison
│   │   ├── ai-gateway/         # PlantAIProvider (OpenAI + LangChain/LangGraph)
│   │   ├── credits/            # append-only ledger, debit/refund, reconcile
│   │   ├── chat/               # per-plant AI chat
│   │   ├── subscriptions/      # tiers, plans (DB-driven)
│   │   ├── payments/           # PaymentPort + ZarinpalMockAdapter
│   │   ├── notifications/      # MailPort (SMTP) + web push + reminder scheduler
│   │   ├── catalog/            # species / care-guide catalog (admin-maintained)
│   │   └── admin/              # admin panel APIs + config
│   ├── db/                     # Drizzle schema + migrations
│   ├── jobs/                   # BullMQ workers (ai, reminders, purge, reconcile)
│   └── common/                 # guards, filters (RFC7807), pipes, config
└── test/                       # integration (Supertest) + unit (Vitest)

frontend/                        # Next.js App Router (Persian/RTL)
├── src/
│   ├── app/                    # /(fa) app routes + /admin
│   ├── components/
│   ├── features/               # scan, plants, chat, billing, notifications
│   ├── lib/                    # api client, query hooks
│   └── theme/                  # MUI theme, CSS vars, Vazirmatn
└── test/                       # unit (Vitest) + E2E (Playwright)

shared/                          # shared Zod schemas + inferred TS types (contracts)
docker-compose.yml               # postgres, redis, minio, api, web (local)
```

**Structure Decision**: Simple two-application layout (`backend/`, `frontend/`) plus a lightweight `shared/` package for Zod contract schemas and inferred types — one repository, no monorepo build tooling (per user "keep it simple"). The API is a **modular monolith**: feature modules with clear boundaries around the correctness-critical `credits` and `ai-gateway` modules, deployable as one unit and splittable later if needed.

## Complexity Tracking

> No Constitution Check violations requiring justification. Modular monolith + simple layout are the simplest structures that satisfy the requirements.
