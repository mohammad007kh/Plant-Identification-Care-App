# Task: T-011 - DB Schema: Credits & Billing (subscription_tier, credit_transaction, usage_record, payment_event)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US4
**Requirement**: FR-014

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
| `code_patterns.data_access` | repository |
| `code_patterns.validation_approach` | schema (Zod at API boundary) |
| `database.tenancy_model` | single_tenant — every user-owned row carries `user_id` |
| `database.type` | postgresql |
| `database.naming_tables` / `naming_columns` | snake_case |
| `database.primary_key_type` | ulid (internal `id`); external id = opaque `uuid` (`public_id`) |
| `database.audit_columns` | true — `created_at`/`updated_at` (timestamptz UTC) |
| `domain.money_representation` | integer_minor_units |
| `payment.event_persistence` | ledger |

### Domain Rules (from subagent/station)

- **Requirement FR-014** (exact text from spec.md): "System MUST support three subscription tiers (Free, Pro, Max), each with an admin-configurable monthly credit allowance."
- **Money**: all monetary values are integer minor units (e.g. IRR smallest unit) — never floats. `price_minor` on `subscription_tier` and `price_snapshot_minor` on `payment_event` follow this.
- **`subscription_tier` table** (the plans themselves — read live for the upgrade modal, no hardcoded plan data anywhere in the app per FR-016/FR-018): `id` (ulid PK), `public_id` (uuid), `key` (enum: `free`/`pro`/`max`), `monthly_credit_allowance` (integer, admin-configurable — this is the FR-014 requirement made concrete), `price_minor` (integer), `currency` (char(3), default `'IRR'`), `active` (boolean), `created_at`/`updated_at`.
- **`credit_transaction` table** (ledger — source of truth for all credit movement): `id` (ulid PK), `user_id` (FK → `user`), `amount` (integer, **signed**: grant/refund > 0, debit < 0), `type` (enum: `grant`/`debit`/`refund`/`expiry`), `related_type` (enum: `scan`/`chat_message`/`comparison`/`subscription`/`monthly_reset`, nullable), `related_id` (ulid, nullable), `idempotency_key` (text, **unique** — prevents double post), `created_at`.
  - **Critical invariant**: `users.credit_balance == SUM(credit_transaction.amount WHERE user_id)`. A later reconciliation job (owned by T-015) asserts this; this task must at minimum make the invariant enforceable (correct column types/constraints) and should include a test that inserting ledger rows and summing them matches an expected balance.
- **`usage_record` table** (AI action state machine — one row per attempted AI action, decoupling the "did we debit" question from "did the AI action ultimately succeed"): `id` (ulid PK), `user_id` (FK → `user`), `action` (enum: `identify`/`comparison`/`chat`), `status` (enum: `pending`/`completed`/`failed`), `debit_txn_id` (FK → `credit_transaction`), `refund_txn_id` (FK → `credit_transaction`, nullable, **unique** — enforces "one refund max" per usage record), `idempotency_key` (text, unique), `created_at`, `resolved_at` (nullable). A stuck `pending` row past a timeout is refunded idempotently by a later reconciliation job (T-015) — not implemented here.
- **`payment_event` table** (ledger for mock-Zarinpal payment attempts): `id` (ulid PK), `public_id` (uuid), `user_id` (FK → `user`), `provider` (text, e.g. `'zarinpal_mock'`), `provider_ref` (text — Authority/RefID from the provider), `plan_id` (FK → `subscription_tier`), `price_snapshot_minor` (integer), `credit_allowance_snapshot` (integer), `status` (enum: `initiated`/`verified`/`failed`), `raw_payload` (jsonb), `idempotency_key` (text, unique), `created_at`. A verified event grants credit + sets the user's tier in one transaction, idempotent by `provider_ref` — implemented by a later payments task, not this one.
- **`users.credit_balance` cache**: this column was already added to the `user` table by T-010 (as a plain `integer default 0` with no FK) — this task adds the deferred `subscription_tier_id` FK constraint onto the existing `user.subscription_tier_id` column (or adds the column now via `ALTER TABLE` if T-010 omitted it, per that task's note preferring omission) now that `subscription_tier` exists, following the `expand_contract` migration strategy.
- **Critical invariants owned by this task's tables** (from data-model.md): (2) `credit_balance == SUM(ledger)`; every debit has at most one refund; idempotency keys unique. (4) Credit refunded exactly once on AI failure (balance unchanged vs. pre-attempt) — schema-level support is the `usage_record.refund_txn_id` unique constraint; the debit/refund *logic* is implemented in T-015. (5) Payment credit granted exactly once per `provider_ref` (idempotent) — schema-level support is `payment_event.idempotency_key`/`provider_ref` uniqueness; logic lands in a later payments task.

### API Context (from contracts/)

```yaml
# Endpoints this schema will eventually back (implemented in later feature-module tasks, not this one)
GET /v1/credits/balance → returns CreditBalance { balance: integer, tier: enum(free,pro,max) }
GET /v1/subscriptions/plans → returns Plan[] { id, key, monthlyCreditAllowance, priceMinor, currency } — "Live plans from DB (drives the upgrade modal — no hardcoded data)"
POST /v1/payments/checkout → initiates mock Zarinpal checkout, snapshots price+allowance
GET /v1/payments/verify → server-to-server verify callback; idempotent credit grant + tier change on success
```

### Feature Summary

Every AI-powered action (scan, chat message, comparison) draws from a monthly credit balance tied to a Free/Pro/Max subscription tier, with credits refunded on AI service failure and tiers purchased via a mock Zarinpal flow. This task defines the Drizzle schema for the tier catalog and the append-only credit ledger, usage-record state machine, and payment-event ledger that make that system auditable and safe under concurrency.

### Gate Criteria (from subagent/station)

- [ ] `subscription_tier` has exactly three seedable rows keyed `free`/`pro`/`max`, each with an independently editable `monthly_credit_allowance` (admin-configurable per FR-014).
- [ ] `credit_transaction.idempotency_key` is unique; `amount` is signed (positive for grant/refund, negative for debit).
- [ ] `usage_record.refund_txn_id` is unique (nullable), enforcing "at most one refund per usage record".
- [ ] `payment_event.idempotency_key` (and effectively `provider_ref` per provider) is unique, enforcing "credit granted exactly once per payment".
- [ ] `user.subscription_tier_id` gets its FK constraint added via an `ALTER TABLE` migration (expand_contract) now that `subscription_tier` exists.
- [ ] A test proves `SUM(credit_transaction.amount WHERE user_id = X)` can be computed and compared against `user.credit_balance`.
- [ ] Migration is generated and applies cleanly against the T-010 schema.

---

## 🎯 Objective

Define the Drizzle schema and migration for `subscription_tier`, `credit_transaction` (append-only ledger with unique `idempotency_key`), `usage_record` (AI-action state machine with a unique refund constraint), and `payment_event` (idempotent-by-`provider_ref` payment ledger), and wire the deferred `user.subscription_tier_id` FK — establishing the data foundation for the three-tier, admin-configurable credit system required by FR-014.

## 🛠️ Implementation Details

<!--
  CONTEXT PINNING:
  This section contains ALL the info needed to write code.
  Do not look at plan.md.
-->

### Files to Create

- `backend/src/db/schema/subscription-tier.ts` - Drizzle table for `subscription_tier` (`key` as a `pgEnum('tier_key', ['free','pro','max'])`).
- `backend/src/db/schema/credit-transaction.ts` - Drizzle table for `credit_transaction` (`type`/`related_type` as `pgEnum`s; unique index on `idempotency_key`).
- `backend/src/db/schema/usage-record.ts` - Drizzle table for `usage_record` (`action`/`status` as `pgEnum`s; unique index on `idempotency_key`; unique index on `refund_txn_id` where not null).
- `backend/src/db/schema/payment-event.ts` - Drizzle table for `payment_event` (`status` as `pgEnum`; unique index on `idempotency_key`; a unique index on `(provider, provider_ref)` to enforce per-provider idempotency).
- `backend/src/db/schema/credits-billing.test.ts` (colocated with the new schema files, per project convention) - Vitest integration test that: (a) inserts a `subscription_tier` row and updates its `monthly_credit_allowance`, asserting the update persists (proves admin-configurability at the data layer, FR-014); (b) inserts a sequence of `credit_transaction` rows for one user (a `grant`, a `debit`, a `refund`) and asserts `SUM(amount)` equals the expected running balance; (c) attempts to insert two `credit_transaction` rows with the same `idempotency_key` and asserts the second insert is rejected (unique constraint); (d) attempts to set `refund_txn_id` on two different `usage_record` rows to the same `credit_transaction.id` and asserts the second is rejected (unique constraint); (e) attempts to insert two `payment_event` rows with the same `(provider, provider_ref)` and asserts the second is rejected.

### Files to Update (REQUIRED)

- `backend/src/db/schema/user.ts` - Add the `subscription_tier_id` FK constraint referencing `subscription_tier.id` (if T-010 added the column without a constraint) or add the column now via this task's migration if T-010 omitted it entirely, per the expand_contract strategy noted in T-010.
- `backend/src/db/schema/scan.ts` - Add the `usage_record_id` FK constraint referencing `usage_record.id` (deferred by T-010 for the same reason — `usage_record` didn't exist yet).
- `backend/src/db/schema/index.ts` - Add barrel exports for the four new schema modules.
- `backend/src/db/seed.ts` - Replace the remaining `// TODO(T-011)` stub in `seedTiers()` with a real import from `backend/src/db/schema/subscription-tier.ts` and an idempotent upsert (`ON CONFLICT (key) DO UPDATE SET monthly_credit_allowance = ...`) of the three tiers with sensible launch-default allowances/prices (exact values are a launch config decision per spec.md Assumption #6 — use clearly-labeled placeholder defaults, e.g. free=20, pro=200, max=1000 credits/month, and note in a comment that the founder should tune these before launch).

### Code/Logic Requirements

- `credit_transaction.amount` must be a signed integer column (no `CHECK (amount > 0)` — negative debits are valid and expected).
- Do not implement the actual debit/refund/reconciliation *business logic* in this task (that's `CreditsService` in T-015) — this task is schema-only, though its integration test may perform raw inserts to prove the constraints work.
- The `user.subscription_tier_id` FK migration must not break existing T-010 rows — if T-010 already inserted a default value (e.g. via the seed script) ensure the FK addition doesn't orphan any row (in practice, since this is pre-launch local dev data, this is low-risk, but write the migration to be defensive, e.g. allow null and only enforce NOT NULL if the product requires every user to always have a tier — Free is the default tier for every account, so ideally NOT NULL with a default pointing at the `free` tier's `id`, set via a data-migration step within the same migration file if Drizzle Kit supports it, or documented as a manual follow-up otherwise).

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

### Shared (All Platforms)
- [x] **Database model** → Migration created (subscription_tier, credit_transaction, usage_record, payment_event tables + deferred FK additions on user/scan)
- [ ] **Environment var** → Added to .env.example
- [ ] **API client** → Endpoint added to service layer

## ✅ Verification

**Command**: `cd backend && npm run db:generate && npm test -- schema-credits`
**Success Criteria**: `db:generate` produces a new migration with no errors; `npm test -- schema-credits` passes all five assertions in the integration test (tier update, ledger sum, two unique-constraint rejections, payment idempotency rejection).

### Integration Verification (if wiring items checked)

```bash
cd backend && npm run db:migrate
cd backend && npm test -- schema-credits --run
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
