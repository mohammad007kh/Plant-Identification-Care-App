# Research: Plant Identification & Care App

Phase 0 research. Most decisions were pinned during `/atomicspec.clarify` (see `specs/_defaults/registry.yaml` `_provenance` and `specs/_defaults/changelog.md`) via a five-specialist + supervisor pass. This file records the load-bearing decisions in Decision / Rationale / Alternatives form, plus the deltas decided during this plan session.

## D1 — End-to-end TypeScript, modular monolith
- **Decision**: NestJS API + Next.js (App Router) web + shared Zod contracts, deployed as a modular monolith.
- **Rationale**: One language, shared types, AI-assistant-legible structure; module boundaries isolate the correctness-critical credit/AI logic; single deploy for a solo founder.
- **Alternatives**: Microservices (premature); Fastify (leaner but hand-rolled structure); Python backend (breaks type-sharing, and we call an external model rather than hosting one).

## D2 — AI integration (OpenAI + LangChain/LangGraph behind PlantAIProvider)
- **Decision**: All model calls (identify, compare, chat) go through a single `PlantAIProvider` interface + `AiGatewayService`, orchestrated with LangChain/LangGraph over OpenAI. The gateway owns the 70% confidence gate, retry/timeout, structured logging, and the credit debit/refund coupling.
- **Rationale**: Founder chose OpenAI/LangChain/LangGraph; the abstraction keeps the provider swappable and centralizes the confidence gate + credit safety.
- **Iran note (founder-owned)**: OpenAI reachability/billing from Iran is the founder's responsibility (risk IR-1). The abstraction means a relay or provider swap does not touch business logic.
- **Alternatives**: Direct SDK calls scattered across services (rejected — couples business logic to provider); self-hosted vision model (heavier ops).

## D3 — Credit system: append-only ledger + cached balance
- **Decision**: `credit_transactions` (immutable: grant | debit | refund | expiry) is the source of truth; `users.credit_balance` is a denormalized cache updated in the SAME transaction. Each AI action: conditional debit (`... WHERE balance >= cost`) + a `usage_record` (pending) with an idempotency key, in one tx; call AI outside the tx; on success mark completed; on failure insert a compensating refund row + mark failed. Unique constraints prevent double-charge/double-refund. A BullMQ reconciliation sweep resolves stuck `pending` records.
- **Rationale**: Refund-on-failure needs an auditable record of what to reverse; conditional update prevents race double-spend; idempotency keys kill free retries; reconciliation turns at-least-once job delivery into an effectively exactly-once credit guarantee without distributed transactions.
- **Alternatives**: Bare mutable balance (no refund trail — rejected); pure ledger with per-request SUM() (correct but slower on hot paths).

## D4 — Payments: PaymentPort port/adapter, Zarinpal-mock now
- **Decision**: A `PaymentPort` interface (`initiatePayment`, `verifyPayment`, `refund`, `getPlans`) with `ZarinpalMockAdapter` in v1; real Zarinpal + Stripe are additive adapters later. Plans are read live from a `plans` table. On checkout, snapshot the plan price + credit allowance into the payment event; NEVER grant credit off the redirect — re-verify server-to-server; grant credit idempotently in one tx keyed by RefID.
- **Rationale**: PRD requires swappability; Zarinpal is a redirect + Verify-API flow (not Stripe HMAC), so "never trust the redirect" is baked in from day one.
- **Alternatives**: Thin wrapper (couples to Zarinpal callback shape); direct SDK (no swap path).

## D5 — Email/notifications: SMTP MailPort, email primary
- **Decision**: Transactional email via generic SMTP (Iranian relay on an owned domain, SPF/DKIM/DMARC) behind a `MailPort`; React-Email templates in-repo. Care reminders: email primary, web push (VAPID/FCM) best-effort/secondary.
- **Rationale**: Western email APIs may geoblock Iran; SMTP + port keeps delivery working and swappable. Web push via FCM is unreliable in Iran, so it cannot be the guaranteed channel.
- **Alternatives**: Resend/SendGrid/SES (Iran-block risk); self-hosted Postfix (deliverability/maintenance burden for a solo founder).

## D6 — Data & domain primitives
- **Decision**: PostgreSQL + Drizzle; ULID internal PK + separate opaque UUID `public_id` in URLs/APIs; money = integer minor-units (Toman/Rial); time = UTC (Jalali is presentation-only, `Asia/Tehran`); targeted soft-delete via `users.deletion_status` for the 7-day grace; snake_case naming; query-builder style with raw SQL allowed for analytics.
- **Rationale**: ULID = index locality + chronological sort; opaque public id avoids enumeration/timing leaks; integer money avoids rounding bugs; UTC + single Iran TZ simplifies reminder scheduling.
- **Alternatives**: UUIDv4 PK (loses sort locality); decimal money (fine but app-level integer is simpler); storing local time (only correct for date-only fields).

## D7 — Auth: JWT (deviation from registry `session`)
- **Decision**: JWT — short-lived access token + rotating refresh token (httpOnly cookie) + server-side refresh denylist for revocation. Email/password only (Google deferred).
- **Rationale**: Founder preference. Mitigations restore the revocation property that sessions give for free.
- **Tradeoff / Alternatives**: Sessions (recommended by the security specialist: instant revocation, smaller surface for a single-origin web app) — overridden by founder. JWT requires disciplined refresh rotation + denylist + CSRF handling matched to token transport.

## D8 — Async AI execution
- **Decision**: AI actions (identify, compare, chat) run as BullMQ jobs; the client submits and polls a job-status endpoint; the credit debit happens at enqueue, refund on job failure.
- **Rationale**: OpenAI latency is unpredictable (more so behind any relay); blocking HTTP would tie up connections and feel broken on throttled networks.
- **Alternatives**: Synchronous request/response (simpler but fragile under latency/timeouts).

## D9 — Guest 2-scan limit + merge
- **Decision**: Server-set httpOnly guest-id cookie; scans counted server-side against it, with a per-IP daily backstop and a cost-bounded shared free pool. At registration, re-parent guest-owned scans in a single locked transaction (`SELECT ... FOR UPDATE` the guest row, convert-once constraint).
- **Rationale**: Client-side counting is trivially bypassed; the free-pool cap bounds cost even when leaked; single-tx merge prevents partial/orphaned re-parenting.
- **Alternatives**: Client-side counters (rejected); phone/OTP gate (deferred; needs domestic SMS gateway).

## D10 — File upload safety (photos)
- **Decision**: Validate by magic bytes (not extension/Content-Type) against the admin-configured allowlist; decode + re-encode to strip EXIF/polyglots; cap file size and decompressed pixel dimensions; exclude SVG; store with randomized names in a non-executable path (MinIO locally / ArvanCloud S3 later).
- **Rationale**: Extension/MIME are forgeable; re-encoding neutralizes hidden payloads; pixel caps block decompression bombs.
- **Alternatives**: Extension-only validation (rejected — unsafe); antivirus scanning (deferred per PRD P2).

## D11 — Testing, tooling, deploy posture (this session)
- **Decision**: Vitest (unit) + Supertest (API integration) + Playwright (E2E on critical flows), 80% coverage, colocated tests, MSW for HTTP mocking. Local-first: Docker Compose (postgres, redis, minio, api, web); CI/CD, error tracking, and cloud host deferred; secrets via gitignored `.env`.
- **Rationale**: Founder chose local-first with a cloud mindset; keep the toolchain lean and portable.
- **Alternatives**: Jest (NestJS default — Vitest chosen for cross-app consistency and speed); managed cloud + CI now (deferred).

## Deferred / open (carried to tasks / future)
- OpenAI reachability from Iran (IR-1, founder-owned).
- Concrete Iranian SMTP relay + domain auth (IR-2).
- Real Zarinpal/Enamad onboarding (IR-3).
- CI/CD platform, error-tracking service, secret manager — chosen at the cloud-move milestone.
- Starting per-action credit costs and per-tier allowances — admin-configurable; seed defaults set before launch.
