# Task: T-012 - DB Schema: Support Entities (chat, comparison_result, notification, misidentification_report, app_config, analytics_event, deletion_audit)

**Status**: Pending
**Created**: 2026-07-19 | **Completed**: N/A
**User Story**: US5, US6, US7, US8, US9 (data foundation)
**Requirement**: N/A — data foundation for US5-US9 (no single FR maps 1:1 to schema-only work)

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
| `code_patterns.data_access` | repository |
| `code_patterns.validation_approach` | schema (Zod at API boundary) |
| `database.tenancy_model` | single_tenant — every user-owned row carries `user_id` |
| `database.type` | postgresql |
| `database.naming_tables` / `naming_columns` | snake_case |
| `database.primary_key_type` | ulid (internal `id`); external id = opaque `uuid` (`public_id`) |
| `database.audit_columns` | true (except `deletion_audit`, which is deliberately PII-free and minimal — see below) |
| `database.soft_delete` | true (account-level only; see `user.deletion_status` from T-010) |

### Domain Rules (from subagent/station)

- **`chat_conversation` / `chat_message` tables** (US6 — plant chat): conversation: `id`, `public_id`, `user_id` (FK), `plant_id` (FK), `created_at`. message: `id`, `conversation_id` (FK), `role` (enum: `user`/`assistant`), `content` (text), `context_photo_ids` (uuid array, **max 2** — enforce via a `CHECK (array_length(context_photo_ids, 1) IS NULL OR array_length(context_photo_ids, 1) <= 2)` or equivalent), `usage_record_id` (FK → `usage_record`, nullable — only assistant messages that consumed credit have one), `created_at`. Free-tier cap of 10 free messages/conversation before the credit paywall applies is application logic (a later chat-module task), not enforced at the schema level.
- **`comparison_result` table** (US5 — health-trend comparison): `id`, `scan_id` (FK, `scan.type = 'comparison'`), `plant_id` (FK), `verdict` (enum: `improved`/`worse`/`unchanged`), `referenced_photo_ids` (uuid array), `created_at`. Requires ≥2 photos on the plant to produce a verdict (else "need a follow-up photo") — this business rule is application logic in a later comparison-module task, not a schema constraint (a plant legitimately can have 0-1 photos with no `comparison_result` row yet).
- **`notification` table** (US7 — care reminders): `id`, `user_id` (FK), `plant_id` (FK), `type` (enum: `watering`, extensible to more reminder types later — model as a text/enum with room to grow, e.g. `pgEnum` with at least `watering` today), `channel` (enum: `email`/`push`), `scheduled_for` (timestamptz), `status` (enum: `scheduled`/`sent`/`skipped`/`failed`), `template_key` (text), `created_at`, `sent_at` (nullable). Admin-configurable templates/timing (FR-021, implemented via `app_config` + a later admin task) and user notification prefs (`user.notif_email_enabled`/`notif_push_enabled` from T-010) gate delivery — gating logic is application-level, not schema-level.
- **`misidentification_report` table** (US9 — admin review): `id`, `public_id`, `user_id` (FK), `scan_id` (FK), `photo_id` (FK), `ai_result` (jsonb — snapshot of what the AI returned, for admin review context), `note` (text, nullable), `status` (enum: `open`/`reviewed`), `created_at`. Shown in admin with photo + AI result (FR-025, implemented by a later admin task).
- **`app_config` table** (US9 — admin-editable operational settings, referenced by FR-005/FR-027): `key` (text, PK), `value` (jsonb), `updated_by` (FK → `user`, the admin who last changed it), `updated_at`. Holds: allowed photo file types, credit cost per action, notification templates/timing. Changes must apply without a deploy — this is guaranteed by reading this table at request time (implemented by `AppConfigService` in T-013), not by anything in this schema task itself.
- **`analytics_event` table** (cross-cutting, FR-028): `id`, `user_id` (FK, nullable — guest actions have no user), `name` (text), `props` (jsonb), `created_at`. Minimum events tracked (per FR-028, application-level emission, not enforced by schema): `scan_attempt`, `scan_success`/`scan_failure`, `confidence_score`, `registration_conversion`, `tier_change`, `credit_consumption`, `chat_usage`, `notification_delivery`.
- **`deletion_audit` table** (US8 — account deletion, FR-023, deliberately **PII-free**): `id`, `user_public_id_hash` (text — a one-way hash of the deleted account's `public_id`, never the raw `public_id`, `email`, or any other PII), `requested_at`, `purged_at`, `outcome` (enum: `completed`/`failed`). This table intentionally does **not** get a `user_id` FK (the whole point is it survives after the user row is purged) and does **not** get standard `created_at`/`updated_at` audit columns — its own `requested_at`/`purged_at` timestamps serve that purpose. Document this deviation from the "audit columns on all tables" convention directly in the schema file's comments since it is a deliberate compliance-driven exception, not an oversight.

### API Context (from contracts/)

```yaml
# Endpoints this schema will eventually back (implemented in later feature-module tasks, not this one)
POST /v1/plants/{id}/chat → chat message (uses chat_conversation/chat_message)
GET /v1/plants/{id}/chat/messages → paginated chat history
POST /v1/misidentification-reports → creates misidentification_report
GET /v1/notifications/preferences, PATCH /v1/notifications/preferences → gates notification delivery
GET /v1/admin/config, PATCH /v1/admin/config → reads/writes app_config
GET /v1/admin/misidentification-reports → lists misidentification_report with photo + ai_result
```

### Feature Summary

Beyond the core identify/save/track loop, the app supports per-plant AI chat, health-trend photo comparison, care reminders, misidentification reporting, admin-configurable operational settings, activity analytics, and a compliant account-deletion audit trail. This task defines the Drizzle schema for all of those supporting entities.

### Gate Criteria (from subagent/station)

- [ ] `chat_message.context_photo_ids` enforces a maximum of 2 elements at the DB level.
- [ ] `app_config` uses a `key`-as-PK jsonb-value shape so admin config changes require no schema migration to add new setting keys.
- [ ] `deletion_audit` contains no raw PII (no plaintext `user_id`/`email`/`public_id`) — only a one-way hash — and is documented as intentionally excluded from the standard audit-column pattern.
- [ ] `analytics_event.user_id` is nullable (to support guest-attributed events).
- [ ] Migration is generated and applies cleanly against the T-010/T-011 schema.

---

## 🎯 Objective

Define the Drizzle schema and migration for the remaining v1 entities not covered by T-010/T-011: `chat_conversation`/`chat_message`, `comparison_result`, `notification`, `misidentification_report`, `app_config`, `analytics_event`, and the deliberately PII-free `deletion_audit` — completing the data foundation for chat (US6), health-trend comparison (US5), reminders (US7), misidentification reporting/admin config (US9), analytics (FR-028), and compliant account deletion (US8).

## 🛠️ Implementation Details

<!--
  CONTEXT PINNING:
  This section contains ALL the info needed to write code.
  Do not look at plan.md.
-->

### Files to Create

- `backend/src/db/schema/chat.ts` - Drizzle tables for `chat_conversation` and `chat_message` (colocated in one file since they're a tightly-coupled parent/child pair), including the `role` enum and the `context_photo_ids` max-2 `CHECK` constraint.
- `backend/src/db/schema/comparison-result.ts` - Drizzle table for `comparison_result` (`verdict` enum).
- `backend/src/db/schema/notification.ts` - Drizzle table for `notification` (`type`/`channel`/`status` enums).
- `backend/src/db/schema/misidentification-report.ts` - Drizzle table for `misidentification_report` (`status` enum).
- `backend/src/db/schema/app-config.ts` - Drizzle table for `app_config` (`key` text PK, `value` jsonb).
- `backend/src/db/schema/analytics-event.ts` - Drizzle table for `analytics_event`.
- `backend/src/db/schema/deletion-audit.ts` - Drizzle table for `deletion_audit`, with an inline comment explaining why it deviates from the standard audit-column/PII conventions (per Domain Rules above).
- `backend/src/db/schema/schema-support.test.ts` (colocated) - Vitest integration test that: (a) attempts to insert a `chat_message` with 3 `context_photo_ids` and asserts it is rejected by the CHECK constraint; (b) inserts and reads back an `app_config` row by `key` and updates its `value`, asserting the new value persists (proves config changes don't require a migration); (c) inserts a `deletion_audit` row and asserts no column on that table references a real `user.id` (schema-shape assertion — e.g. introspect the table's columns and assert `user_id` is not among them); (d) inserts an `analytics_event` with `user_id = null` and asserts it succeeds (guest-attributed event support).

### Files to Update (REQUIRED)

- `backend/src/db/schema/index.ts` - Add barrel exports for the seven new schema modules.
- `backend/src/db/seed.ts` - Replace the remaining `// TODO(T-012)` stub in `seedAppConfig()` with a real import from `backend/src/db/schema/app-config.ts` and an idempotent upsert (`ON CONFLICT (key) DO UPDATE`) of the default config rows: allowed photo file types (`["image/jpeg","image/png","image/webp"]`), and per-action credit costs for `identify`/`chat`/`comparison` (placeholder launch defaults, e.g. `{ identify: 1, chat: 1, comparison: 2 }` — noted as founder-tunable before launch per spec.md Assumption #6).

### Code/Logic Requirements

- The `context_photo_ids` array-length CHECK must specifically cap at 2 (not just "an array column exists") — this directly encodes the FR-012 "up to 2 photos" rule at the data layer as a defense-in-depth measure, even though the primary enforcement is application-level in the chat module.
- `deletion_audit.user_public_id_hash` must be a deterministic one-way hash (e.g. SHA-256) of the account's `public_id` — document the hashing approach in a code comment even though the hashing function itself is implemented by the later account-deletion task; this task only needs the column shaped correctly (`text`, not a raw UUID/FK).
- Do not implement the actual chat/comparison/notification/report/config *business logic* in this task — schema only.

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
- [x] **Database model** → Migration created (chat_conversation, chat_message, comparison_result, notification, misidentification_report, app_config, analytics_event, deletion_audit)
- [ ] **Environment var** → Added to .env.example
- [ ] **API client** → Endpoint added to service layer

## ✅ Verification

**Command**: `cd backend && npm run db:generate && npm test -- schema-support`
**Success Criteria**: `db:generate` produces a new migration with no errors; `npm test -- schema-support` passes all four assertions (context-photo-cap rejection, app_config upsert, deletion_audit PII-free shape, nullable analytics user_id).

### Integration Verification (if wiring items checked)

```bash
cd backend && npm run db:migrate
cd backend && npm test -- schema-support --run
```

## 📝 Completion Log

- [ ] Code implemented
- [ ] Tests passed
- [ ] Linter passed
- [ ] Wiring checklist verified
- [ ] Integration verification passed
