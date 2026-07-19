# Quickstart: Plant Identification & Care App (local dev)

Local-first setup. Everything runs in Docker Compose; production hosting (VPS / ArvanCloud) is deferred.

## Prerequisites
- Node.js 22 LTS + npm (or pnpm)
- Docker + Docker Compose
- An OpenAI API key reachable from your environment (founder-owned; see risk IR-1)

## 1. Environment
Copy `.env.example` → `.env` (gitignored). Required keys:

```
# Core
NODE_ENV=development
DATABASE_URL=postgres://plant:plant@localhost:5432/plant
REDIS_URL=redis://localhost:6379

# Auth (JWT)
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
ACCESS_TOKEN_TTL=900          # 15 min
REFRESH_TOKEN_TTL=2592000     # 30 days

# AI (OpenAI via LangChain/LangGraph)
OPENAI_API_KEY=sk-...
AI_CONFIDENCE_THRESHOLD=0.70

# Object storage (S3-compatible; MinIO locally)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=plant-photos
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# Email (SMTP MailPort)
SMTP_HOST=localhost
SMTP_PORT=1025                # Mailpit in dev
SMTP_FROM=no-reply@plantcare.local

# Payments (Zarinpal MOCK)
PAYMENT_PROVIDER=zarinpal_mock
```

## 2. Start infrastructure + apps
```
docker compose up -d      # postgres, redis, minio, mailpit
npm install
npm run db:migrate        # Drizzle migrations
npm run db:seed           # tiers (free/pro/max), a demo admin, sample species, config defaults
npm run dev               # runs backend (NestJS) + frontend (Next.js) concurrently
```

- Web: http://localhost:3000 (Persian / RTL)
- API: http://localhost:3001/v1
- Mailpit (email inbox): http://localhost:8025
- MinIO console: http://localhost:9001

## 3. Smoke test the core flow (US1 / US2)
1. Open the web app as a guest → upload a clear leaf photo → get a species + care guide (or a low-confidence prompt if < 70%).
2. Do it twice → the 3rd attempt shows the registration wall.
3. Register (email/password) → confirm prior guest scans appear in your profile (zero loss).

## 4. Verify credit integrity (US4)
- Check `GET /v1/credits/balance`.
- Exhaust credits → `POST /v1/scans` returns 402 → upgrade modal lists live plans from `GET /v1/subscriptions/plans`.
- Simulate an AI failure (set an invalid `OPENAI_API_KEY` or the dev fault flag) → confirm the balance is unchanged after the failed attempt (refund).
- Complete a mock Zarinpal checkout → tier + credits updated, no real transaction.

## 5. Tests
```
npm run test         # Vitest unit
npm run test:int     # Supertest API integration
npm run test:e2e     # Playwright — critical flows (scan→identify, register+carryover, credit exhaustion, mock checkout)
npm run test:cov     # coverage (target 80%)
```

## 6. Key module boundaries (backend/src/modules)
`ai-gateway` (PlantAIProvider + confidence gate) · `credits` (ledger, debit/refund, reconcile) · `payments` (PaymentPort + ZarinpalMockAdapter) · `notifications` (MailPort + scheduler) · `auth` (JWT) · `admin` (config, catalog, reports).

## Notes / deferred
- Google sign-in: not in v1 (email/password only).
- Web push: best-effort; email is the guaranteed reminder channel.
- CI/CD, error tracking, cloud host, real Zarinpal/Enamad, Iranian SMTP relay: cloud-move milestone.
