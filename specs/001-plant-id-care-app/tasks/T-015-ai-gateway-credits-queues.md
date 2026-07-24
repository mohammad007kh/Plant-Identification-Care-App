# Task: T-015 - AI Gateway, Credit Ledger & Job Queues

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: Foundation (shared by US1, US4, US5, US6)
**Requirement**: FR-015, FR-017

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
- verify-depth:          deep
## 📋 Embedded Context (READ THIS FIRST)

### Project Standards (from registry)

| Key | Value |
|-----|-------|
| `architecture.pattern` | modular_monolith (NestJS modules: `ai-gateway`, `credits`, `jobs`) |
| `architecture.communication` | async (BullMQ jobs + client status polling) |
| `code_patterns.data_access` | repository (no naked Drizzle queries) |
| `code_patterns.error_handling` | exceptions → RFC7807 |
| `backend.job_queue` | bull (BullMQ over Redis) |
| `backend.job_durability_semantics` | at_least_once + idempotent ledger writes |
| `database.primary_key_type` | ULID internal `id`; opaque UUID `public_id` |
| `domain.money_representation` | integer minor units (credits are integers) |

### Domain Rules (from Station 10 — Metering & Limits, Station 07 — Data)

- **Append-only ledger is the source of truth.** `credit_transaction` rows (`grant | debit | refund | expiry`) are immutable; `users.credit_balance` is a denormalized cache updated in the SAME transaction as each ledger insert. Invariant: `credit_balance == SUM(credit_transaction.amount)`.
- **Atomic conditional debit.** Debit is a single conditional update (`... WHERE credit_balance >= :cost`) + ledger insert in one DB transaction — prevents race double-spend. If the guard fails, raise a 402-mapped exception (the 402 payload/upgrade-modal wiring is T-082).
- **Idempotency.** Every debit/refund carries a unique `idempotency_key` tied to the request; a retried request finds the existing entry instead of posting again (kills free infinite retries).
- **Refund-once.** `usage_record` is a state machine (`pending → completed | failed`); a `refund_txn_id` unique constraint means at most one refund per debit (FR-017). Refund inserts a compensating `+` ledger row and marks the record `failed`.
- **Reconciliation sweep.** A BullMQ repeatable job resolves `usage_record`s stuck in `pending` past a timeout by refunding idempotently — turns at-least-once delivery into an effectively exactly-once credit guarantee without distributed transactions.
- **PlantAIProvider abstraction.** All model calls go through one `PlantAIProvider` interface (`identify(photo)`, `compareHealth(a,b)`, `chat(msg, ctx)`); the concrete adapter is OpenAI via LangChain/LangGraph. Business code never calls OpenAI directly. Swapping providers = new adapter + config flip. The `AiGatewayService` owns the 70% confidence gate, timeout/retry-with-backoff, and structured logging.
- **Credit ⇄ AI coupling contract.** The gateway exposes a `runMeteredAction({ userId, action, cost, idempotencyKey, work })` helper: debit + create `usage_record(pending)` in one tx → run `work` (the AI call, outside the tx) → on success mark `completed`; on failure/timeout insert refund + mark `failed`. US1/US5/US6 tasks call this helper; they do not re-implement metering.

### API Context (from contracts/openapi.yaml)

```yaml
# No HTTP endpoints of its own — this is the async engine consumed by:
POST /v1/scans                (T-020, action=identify)
POST /v1/plants/{id}/photos   (T-060 → comparison job, T-100 logic)
POST /v1/plants/{id}/chat     (T-110, action=chat)
# Job status is surfaced via GET /v1/scans/{id} (T-020).
```

### Feature Summary

Persian/RTL web app for AI plant identification + care with a UNIFIED AI-credit system. This foundation task builds the three load-bearing pieces every AI feature depends on: the provider-agnostic AI gateway (with the 70% confidence gate), the append-only credit ledger with atomic debit/refund-on-failure, and the BullMQ job/queue + reconciliation infrastructure. Correctness here (no double-spend, no double-refund, refund even on crash) is the single most important invariant in the product.

### Gate Criteria (from Station 10 — Metering & Limits)

- [ ] Ledger is append-only; balance cache updated in the same transaction
- [ ] Debit is atomic + conditional (no race double-spend)
- [ ] Idempotency keys prevent double-post on retries
- [ ] Refund-once enforced by a unique constraint
- [ ] Reconciliation job refunds stuck `pending` records idempotently
- [ ] All OpenAI access is behind `PlantAIProvider` (no direct SDK calls in business code)
- [ ] 70% confidence gate enforced in the gateway, not in callers

---

## 🎯 Objective

Build the AI gateway (PlantAIProvider + OpenAI/LangChain adapter + 70% gate), the append-only credit ledger service (atomic debit, refund-once, reconciliation), and the BullMQ queue infrastructure — exposing a single `runMeteredAction` helper for all AI features.

## 🛠️ Implementation Details

### Files to Create

- `backend/src/ai-gateway/plant-ai-provider.interface.ts` - the provider port (`identify`, `compareHealth`, `chat`)
- `backend/src/ai-gateway/openai-langchain.adapter.ts` - OpenAI via LangChain/LangGraph implementation
- `backend/src/ai-gateway/ai-gateway.service.ts` - confidence gate (≥0.70), retry/backoff, structured logging, `runMeteredAction`
- `backend/src/ai-gateway/ai-gateway.module.ts`
- `backend/src/credits/credit-ledger.repository.ts` - append-only inserts + balance cache (single tx), conditional debit, refund-once
- `backend/src/credits/credits.service.ts` - debit / refund / getBalance
- `backend/src/credits/credits.module.ts`
- `backend/src/jobs/queues.ts` - BullMQ queue/worker registration + Redis connection
- `backend/src/jobs/reconciliation.worker.ts` - sweeps stuck `pending` usage records
- `backend/src/credits/credits.service.spec.ts` - concurrency test (parallel debits never overspend), refund-once test, idempotency test
- `backend/src/ai-gateway/ai-gateway.service.spec.ts` - 70% gate test, refund-on-failure test (mock provider throws → balance unchanged)

### Files to Update (REQUIRED)

- `.env.example` - `OPENAI_API_KEY`, `AI_CONFIDENCE_THRESHOLD=0.70`, `REDIS_URL`, `RECONCILE_TIMEOUT_MS`
- `backend/src/app.module.ts` - register `AiGatewayModule`, `CreditsModule`, and the jobs/queue module (this foundation engine IS wired at app root; feature modules that consume it are wired in their own US wiring tasks)

### Code/Logic Requirements

- `runMeteredAction<T>({ userId, action, cost, idempotencyKey, work }): Promise<T>` — the ONLY sanctioned path for a metered AI call. Debit+usage_record(pending) in one tx; run `work()` outside the tx; mark completed on success, refund+failed on throw/timeout.
- `AiGatewayService.identify()` applies the 70% gate: if `confidence < threshold`, return a low-confidence result with `species = null` (callers must not expose a species). Gate threshold from env.
- Ledger repository: `debit()` uses `UPDATE users SET credit_balance = credit_balance - :cost WHERE id = :userId AND credit_balance >= :cost` + insert; 0 rows affected → throw `InsufficientCreditException`.

## 🔌 Wiring Checklist

### Web (React/Vue/Next.js/etc.)
- [ ] **Backend route** → N/A (no HTTP surface); modules registered in `app.module.ts`
- [ ] **Service** → `AiGatewayService` + `CreditsService` exported for injection by US1/US4/US5/US6 modules
- [ ] **Environment var** → added to `.env.example`

## ✅ Verification

**Command**: `cd backend && npm test -- credits ai-gateway`
**Success Criteria**: Concurrency test shows N parallel debits never drive balance negative; refund-once test rejects a second refund; 70% gate test hides sub-threshold species; refund-on-failure test leaves balance unchanged after a provider error.

### Integration Verification

```bash
cd backend && npx tsc --noEmit
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
