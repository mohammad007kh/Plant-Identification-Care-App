# Data Model: Plant Identification & Care App

**Conventions** (from registry): PostgreSQL + Drizzle; internal PK = ULID (`id`); external id = opaque UUID (`public_id`) exposed in APIs/URLs; snake_case tables/columns; money = integer minor-units; time = `timestamptz` UTC; audit columns `created_at`/`updated_at` on all tables (+ `created_by` where admin-edited). Every user-owned row carries `user_id` (tenancy boundary). Soft-delete is targeted (accounts only).

Station 07 (Data Architecture) gate: tenancy = single-tenant B2C via `user_id` FK; enforcement = server-side scoping (no naked cross-user queries); isolation test plan = integration tests assert a user can never read another user's rows.

## Entities

### user
| Column | Type | Notes |
|---|---|---|
| id | ulid PK | internal |
| public_id | uuid | unique, exposed |
| email | citext | unique |
| password_hash | text | argon2id |
| subscription_tier_id | ulid FK → subscription_tier | current tier |
| credit_balance | integer | denormalized cache; = SUM(credit_transactions) |
| notif_email_enabled | boolean | default true |
| notif_push_enabled | boolean | default true |
| deletion_status | enum(active, pending_deletion, purged) | default active |
| deletion_requested_at | timestamptz null | set on deletion request |
| role | enum(user, admin) | default user |
| created_at / updated_at | timestamptz | |

State transitions (deletion): `active → pending_deletion` (request) → `active` (cancel within 7d) OR `purged` (grace elapsed; purge job removes rows + storage objects, writes PII-free `deletion_audit`).

### guest_session
| Column | Type | Notes |
|---|---|---|
| id | ulid PK | matches httpOnly guest-id cookie |
| ip_hash | text | per-IP backstop |
| scan_count | integer | server-authoritative (limit 2) |
| status | enum(active, converted) | |
| converted_to_user_id | ulid FK → user null | convert-once |
| created_at | timestamptz | |

Merge: at registration, re-parent owned `scan`/`plant` rows to the new user in one tx; set status=converted (unique guard prevents double-convert).

### plant
Owner: user. `id`, `public_id`, `user_id` FK, `species_id` FK → species null, `nickname` text null, `created_at/updated_at`. Has many `photo`/`scan`.

### species (catalog — admin-maintained)
`id`, `public_id`, `scientific_name`, `common_name_fa`, `care_guide` (jsonb: watering, light, soil, humidity, temperature, notes), `created_by` (admin), `created_at/updated_at`. Editing a care guide reflects in future identification results (FR-024).

### scan
A single identification/comparison event. Owner: user OR guest_session (exactly one; `CHECK`).
| Column | Type | Notes |
|---|---|---|
| id | ulid PK | |
| public_id | uuid | |
| user_id | ulid FK null | |
| guest_session_id | ulid FK null | (exactly one of user/guest set) |
| plant_id | ulid FK null | set when saved / follow-up |
| type | enum(identify, comparison) | |
| status | enum(pending, completed, failed) | job lifecycle |
| photo_id | ulid FK → photo | primary uploaded photo |
| species_id | ulid FK null | result (only if confidence ≥ 0.70) |
| confidence | numeric(4,3) null | 0.000–1.000 |
| result | jsonb null | care guide snapshot / comparison verdict |
| usage_record_id | ulid FK → usage_record | credit coupling |
| created_at | timestamptz | |

Rule (FR-003): if `confidence < 0.70` → `species_id` NULL, result = low-confidence prompt; never expose a species.

### photo
`id`, `public_id`, `plant_id` FK null, `scan_id` FK null, `storage_key` text (randomized), `content_type`, `bytes`, `width`, `height`, `created_at`. Belongs to a plant's history and/or a scan.

### comparison_result
`id`, `scan_id` FK (type=comparison), `plant_id` FK, `verdict` enum(improved, worse, unchanged), `referenced_photo_ids` uuid[], `created_at`. Requires ≥2 photos on the plant (else "need a follow-up photo").

### chat_conversation / chat_message
- conversation: `id`, `public_id`, `user_id`, `plant_id`, `created_at`.
- message: `id`, `conversation_id` FK, `role` enum(user, assistant), `content` text, `context_photo_ids` uuid[] (≤2), `usage_record_id` FK null (assistant messages consume credit), `created_at`.
Free-tier cap: 10 free messages/conversation then credit paywall (FR-013).

### subscription_tier / plan
- subscription_tier: `id`, `key` enum(free, pro, max), `monthly_credit_allowance` integer (admin-configurable), `price_minor` integer, `currency` char(3) default 'IRR', `active` boolean.
- (Plans read live for the upgrade modal — the `subscription_tier` rows ARE the plans; no hardcoded plan data, FR-015.)

### credit_transaction (ledger — source of truth)
| Column | Type | Notes |
|---|---|---|
| id | ulid PK | |
| user_id | ulid FK | |
| amount | integer | signed: grant/refund > 0, debit < 0 |
| type | enum(grant, debit, refund, expiry) | |
| related_type | enum(scan, chat_message, comparison, subscription, monthly_reset) null | |
| related_id | ulid null | |
| idempotency_key | text | unique — prevents double post |
| created_at | timestamptz | |

Invariant: `users.credit_balance == SUM(credit_transaction.amount WHERE user_id)`. Reconciliation job asserts this.

### usage_record (AI action state machine)
`id`, `user_id`, `action` enum(identify, comparison, chat), `status` enum(pending, completed, failed), `debit_txn_id` FK, `refund_txn_id` FK null (unique — one refund max), `idempotency_key` unique, `created_at`, `resolved_at` null. Stuck `pending` past timeout → reconciliation refunds idempotently.

### payment_event (ledger)
`id`, `public_id`, `user_id`, `provider` text ('zarinpal_mock'), `provider_ref` text (Authority/RefID), `plan_id` FK, `price_snapshot_minor` integer, `credit_allowance_snapshot` integer, `status` enum(initiated, verified, failed), `raw_payload` jsonb, `idempotency_key` unique, `created_at`. Verified → grant credit + set tier in one tx (idempotent by provider_ref).

### notification / reminder
`id`, `user_id`, `plant_id` FK, `type` enum(watering, ...), `channel` enum(email, push), `scheduled_for` timestamptz, `status` enum(scheduled, sent, skipped, failed), `template_key`, `created_at`, `sent_at` null. Admin-configurable templates/timing (FR-021); user prefs gate delivery (FR-022).

### misidentification_report
`id`, `public_id`, `user_id`, `scan_id` FK, `photo_id` FK, `ai_result` jsonb, `note` text null, `status` enum(open, reviewed), `created_at`. Shown in admin with photo + AI result (FR-025).

### app_config (admin-editable operational settings)
`key` PK, `value` jsonb, `updated_by`, `updated_at`. Holds: allowed photo file types, credit cost per action, notification templates/timing. Changes apply without deploy (FR-005, FR-027).

### analytics_event
`id`, `user_id` null, `name` text, `props` jsonb, `created_at`. Min events: scan_attempt, scan_success/failure, confidence_score, registration_conversion, tier_change, credit_consumption, chat_usage, notification_delivery (FR-028). (May be complemented by Google Analytics client-side.)

### deletion_audit (PII-free)
`id`, `user_public_id_hash` text, `requested_at`, `purged_at`, `outcome` enum(completed, failed). Survives the purge as compliance evidence.

## Key relationships
- user 1—* plant, scan, chat_conversation, credit_transaction, usage_record, payment_event, notification, misidentification_report.
- plant 1—* photo, scan, comparison_result, chat_conversation.
- subscription_tier 1—* user; species 1—* plant/scan(result).
- guest_session 1—* scan/photo (pre-registration), then re-parented to user.

## Critical invariants (enforced + tested)
1. No species result when `confidence < 0.70`.
2. `credit_balance == SUM(ledger)`; every debit has at most one refund; idempotency keys unique.
3. Guest scan limit = 2, server-authoritative; all guest scans transfer on registration (zero loss).
4. Credit refunded exactly once on AI failure (balance unchanged vs. pre-attempt).
5. Payment credit granted exactly once per `provider_ref` (idempotent), only after server-side verify.
6. A user can never read another user's owned rows (tenancy).
7. Purge after 7-day grace removes all user rows + storage objects; `deletion_audit` retained.
