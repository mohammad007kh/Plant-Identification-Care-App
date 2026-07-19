# 🌿 Plant Identification & Care App

Identify a plant from a photo of its leaf, get an actionable care guide, and track your plants' health over time — powered by AI. A Persian-first (Farsi / RTL), fully responsive web app built for the Iranian market.

> **Status:** Pre-implementation. The specification, clarification, and implementation plan are complete (spec-driven via [Atomic Spec](#-how-this-repo-is-organized)). Code scaffolding begins at the tasks phase.

---

## ✨ What it does

Snap a leaf photo → get the species name and a structured care guide, with **no login required** for your first two scans. Register to keep a personal collection of plants, track their health with follow-up photos, chat with an AI about a specific plant, and receive watering/care reminders.

### Core features (v1 / MVP)

| Area | Capability |
|---|---|
| **Identification** | AI photo-based plant ID with a **70% confidence gate** (below threshold → prompt for a clearer photo, never a wrong guess) |
| **Guest access** | 2 free scans before a registration wall; all guest scans transfer to the new account on sign-up |
| **Accounts** | Email/password auth; saved plants with photo history |
| **Tracking** | Follow-up photo comparison → health trend (improved / worse / unchanged) |
| **AI chat** | Ask questions about a specific saved plant (up to 2 photos of context) |
| **Credits & tiers** | A unified AI-credit system — every AI action (scan, chat, comparison) consumes credit; **Free / Pro / Max** tiers with admin-configurable monthly allowances; credit **refunded on AI-service failure** |
| **Payments** | Mock **Zarinpal** gateway for v1 (real/international deferred), behind a swappable payment port |
| **Reminders** | Care reminders (e.g., watering) via email (primary) + best-effort web push, with user preferences |
| **Account lifecycle** | Account deletion with a 7-day cancellable grace period, then full purge |
| **Admin panel** | Plant/species database, misidentification reports, user management, and operational config (credit costs, allowances, notification templates, allowed file types) |

### Explicitly out of scope for v1
Multi-language (Persian only), real/international payments (Stripe), antivirus scanning of uploads, native mobile apps, and offline mode. The architecture is kept extensible so these can be added later without a rebuild.

---

## 🧱 Tech stack

End-to-end **TypeScript**, chosen to be Iran-viable and solo-maintainable.

| Layer | Choice |
|---|---|
| **Frontend** | Next.js (App Router, hybrid SSR) · MUI + Emotion (first-class RTL) · Zustand + TanStack Query · React Hook Form + Zod · **i18n from day one** · self-hosted **Vazirmatn** font · WCAG-AA |
| **Backend** | NestJS · Node.js 22 LTS · Drizzle ORM · REST (`/v1`, cursor pagination, RFC 7807 errors) · JWT auth (short-lived access + rotating refresh) |
| **Data** | PostgreSQL · Redis + BullMQ (async AI jobs, scheduling) · ULID internal keys + opaque UUID public ids · integer minor-unit money · UTC time · append-only **credit ledger** |
| **AI** | OpenAI, orchestrated with **LangChain + LangGraph**, behind a swappable `PlantAIProvider` |
| **Payments / Email** | `PaymentPort` (Zarinpal-mock adapter) · SMTP behind a `MailPort` |
| **Storage** | S3-compatible object storage — MinIO locally, ArvanCloud in production (deferred) |
| **Testing** | Vitest (unit) · Supertest (API) · Playwright (E2E on critical flows) · 80% coverage target |
| **Runtime** | Local-first via Docker Compose; cloud/VPS deployment deferred to a later milestone |

---

## 🏗️ Architecture at a glance

A **modular monolith** — one deployable API with clear module boundaries around the correctness-critical parts, splittable into services later if needed.

```
frontend/   Next.js App Router (Persian/RTL) — app routes + admin, components, theme
backend/    NestJS API — feature modules:
            auth · users · guests · plants · scans · ai-gateway · credits
            chat · subscriptions · payments · notifications · catalog · admin
            + db (Drizzle schema/migrations) + jobs (BullMQ workers)
shared/     Zod schemas + inferred TypeScript types (shared contracts)
docker-compose.yml   postgres · redis · minio · mailpit · api · web
```

**Key design guarantees**
- **Credit integrity:** an append-only ledger + cached balance, idempotency keys, a per-action state machine, and a reconciliation sweep — no double-spend, no double-refund, and refund-on-failure even if a worker crashes mid-call.
- **Provider swappability:** all AI calls go through `PlantAIProvider`; all payments through `PaymentPort`; all email through `MailPort`. Swapping a provider is a new adapter, not a rewrite.
- **Upload safety:** image uploads are validated by magic bytes, decoded and re-encoded (stripping EXIF/polyglots), size/pixel-capped, and SVG-excluded.
- **Confidence gate:** a species result is never shown below 70% confidence.

---

## 🚀 Getting started (local development)

> Full details and smoke tests: [`specs/001-plant-id-care-app/quickstart.md`](specs/001-plant-id-care-app/quickstart.md)

**Prerequisites:** Node.js 22 LTS, Docker + Docker Compose, and an OpenAI API key reachable from your environment.

```bash
# 1. Configure environment
cp .env.example .env          # fill in DATABASE_URL, REDIS_URL, JWT secrets,
                              # OPENAI_API_KEY, S3/SMTP settings, etc.

# 2. Start infra + apps
docker compose up -d          # postgres, redis, minio, mailpit
npm install
npm run db:migrate            # Drizzle migrations
npm run db:seed               # tiers, demo admin, sample species, config defaults
npm run dev                   # backend (NestJS) + frontend (Next.js)
```

- Web: http://localhost:3000 · API: http://localhost:3001/v1
- Mailpit inbox: http://localhost:8025 · MinIO console: http://localhost:9001

```bash
npm run test        # unit (Vitest)
npm run test:int    # API integration (Supertest)
npm run test:e2e    # E2E (Playwright)
npm run test:cov    # coverage (target 80%)
```

---

## 📋 How this repo is organized

This project is built with **[Atomic Spec](https://github.com/)** — a spec-driven workflow where the specification, architectural decisions, and plan are versioned artifacts that drive implementation.

```
specs/
├── _defaults/
│   ├── registry.yaml      # Single source of truth for project-wide tech decisions (+ provenance)
│   └── changelog.md       # Audit trail of every decision change
└── 001-plant-id-care-app/
    ├── spec.md            # WHAT & WHY — user stories, functional requirements, success criteria
    ├── clarify-log.md     # Architecture-decision interview record
    ├── plan.md            # HOW — tech stack, structure, contracts approach
    ├── research.md        # Decision / rationale / alternatives
    ├── data-model.md      # Entities, relationships, invariants
    ├── contracts/         # OpenAPI 3.1 API contract
    └── quickstart.md      # Local dev setup
```

**Branch model:** `main` (production) ← `develop` (integration / root for spec branches) ← `NNN-feature` branches. `develop` is the default branch; feature PRs target it.

---

## 🗺️ Roadmap / deferred

- Real Zarinpal (with Enamad merchant onboarding) and later international payments (Stripe)
- Multi-language support (LTR languages) — i18n scaffolding is already in place
- Web push hardening, error tracking, CI/CD, and cloud/VPS deployment
- Antivirus scanning of uploaded photos

---

## 📄 License

Not yet specified. © the project owner. All rights reserved until a license is added.
