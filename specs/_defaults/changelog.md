# Project Defaults Registry — Changelog

All changes to `registry.yaml` are recorded here.

## [2026-07-19] — /atomicspec.plan session (Registry Sync, HITL #4)

Source: specs/001-plant-id-care-app/plan.md · Approved by: Human (add all)

- **backend.auth_method**: `session` → `jwt`  (provenance: human)
  - **DEVIATION** from clarify default. Reason: founder preference. Mitigations: short-lived access token + rotating httpOnly refresh token + server-side refresh denylist for revocation.
- **infrastructure.deployment_target**: `vps` → `containerized`  (provenance: human) — local-first Docker Compose; VPS/ArvanCloud production host deferred to cloud-move milestone.
- **infrastructure.secrets**: `null` → `env-files`  (provenance: accepted_recommendation)
- **testing.unit_framework**: `null` → `vitest`  (human)
- **testing.integration_framework**: `null` → `supertest`  (accepted_recommendation)
- **testing.e2e_framework**: `null` → `playwright`  (human)
- **testing.coverage_target**: `null` → `80`  (human)
- **testing.test_organization**: `null` → `colocated`  (accepted_recommendation)
- **testing.mocking**: `null` → `msw`  (accepted_recommendation)
- **ui_specs.design_tokens**: `null` → `css-variables` (source frontend/src/theme/)  (accepted_recommendation)
- **conventions.variables/files/classes/constants**: `null` → `camelCase / kebab-case / PascalCase / SCREAMING_SNAKE_CASE`  (human)
- **conventions.branches/pr_titles**: `null` → `feat/xxx / conventional`  (accepted_recommendation)

Unchanged (also honored this session): `frontend.styling=emotion` kept as the single UI system (no Tailwind added, per "minimum UI frameworks"); `architecture.repo_structure=monorepo` realized as a simple `frontend/`+`backend/`+`shared/` layout (no Turborepo tooling).

Deferred (cloud-move milestone): `ci_cd`, `error_handling.error_tracking`, `cloud_provider` — left null.

## [2026-07-19] — /atomicspec.clarify session

Mode: Detailed (subagent-supervised architecture interview)
Total questions asked of founder: 4 (plus low-stakes defaults accepted)
Spec clarifications: 5 (written to specs/001-plant-id-care-app/spec.md ## Clarifications)
Registry writes: 90 fields
Provenance summary: 4 human / 86 accepted_recommendation

### Process

Registry did not exist; scaffolded from templates/registry-template.yaml. Decisions were produced by five domain specialists (backend, database, payments+email, security, frontend), reconciled by a supervisor (architect-review), then the genuine judgment-calls were put to the founder. Only the fields actually decided are non-null; the rest remain null for /atomicspec.plan.

### Founder judgment-calls (provenance: human)

- ai.provider / ai.orchestration: **OpenAI + LangChain/LangGraph**, behind a swappable `PlantAIProvider`. Iran reachability accepted as founder's responsibility (was flagged BLOCKING risk IR-1).
- backend.auth_method + auth rails: **email/password only** — Google sign-in DEFERRED (overrides PRD P0; Google OAuth unreliable from Iran).

### Founder-confirmed recommendations (provenance: accepted_recommendation)

- email.transactional_provider: smtp (Iranian relay on owned domain, behind MailPort).
- payment.billing_model: subscription (tier-allowance only; no standalone credit top-ups in v1; ledger kept generic).

### Auto-accepted safe defaults (provenance: accepted_recommendation) — highlights

- Stack: TypeScript end-to-end — Next.js (App Router, hybrid) + MUI/Emotion (RTL) + Zustand/TanStack Query + RHF/Zod frontend; NestJS + Drizzle + PostgreSQL + Redis/BullMQ backend; REST (/v1, cursor, RFC7807).
- Architecture: modular_monolith, async AI via job queue, monorepo + shared Zod contracts.
- Data: ULID internal PK + opaque_uuid public id; integer minor-units money; utc_only; append-only credit ledger + cached balance; targeted soft-delete for 7-day deletion grace.
- Payments: PaymentPort port/adapter; Zarinpal-mock now (provider=none + provider_custom/provider_planned metadata); server-side Verify-API semantics; webhook idempotency (RefID) + 900s replay window.
- Security: session cookies + CSRF token; strict CORS/CSP; magic-byte image validation + re-encode (exclude SVG); admin TOTP-MFA + audit log (no IP allowlist); Cloudflare Turnstile.
- i18n: i18n_from_day_one; self-hosted Vazirmatn; dir=rtl + logical CSS; WCAG-AA; dark mode deferred.
- Infra: VPS + Docker Compose (not Western PaaS); S3-protocol storage via ArvanCloud (cloud_provider left null — no enum match); Postgres FTS; app_scheduler.
- Compliance: gdpr=false, pci=false, data_residency=ir-only.

### Notes / enum gaps recorded

- payment.provider enum has no Iran option → provider=none + provider_custom="zarinpal_mock_v1", provider_planned=[zarinpal_live, stripe].
- infrastructure.cloud_provider enum has no ArvanCloud → left null; object storage uses S3 protocol against ArvanCloud, compute on Iran-reachable VPS.
- Added a non-template `ai:` section to record OpenAI + LangChain/LangGraph.

### Open risks carried to /atomicspec.plan

- IR-1 (was BLOCKING): OpenAI reachability/billing from Iran — founder owns this; keep PlantAIProvider abstraction.
- IR-2 (HIGH): SMTP deliverability — confirm specific Iranian relay + domain auth before launch.
- IR-3 (HIGH): real Zarinpal/Enamad merchant onboarding — parallel business task; MVP ships mock.
