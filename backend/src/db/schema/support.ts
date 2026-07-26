/**
 * Support schema (T-012): chat_conversation/chat_message, comparison_result,
 * notification, misidentification_report, app_config, analytics_event,
 * deletion_audit.
 *
 * Completes the data foundation for per-plant AI chat (US6), health-trend
 * photo comparison (US5), care reminders (US7), misidentification
 * reporting/admin config (US9), cross-cutting analytics (FR-028), and
 * compliant account-deletion audit (US8).
 *
 * Conventions (registry, matching T-010 core.ts): internal PK = ULID `id`
 * (app-generated); external id = opaque UUID `public_id` (only on entities
 * exposed externally); snake_case tables/columns; audit columns everywhere
 * except `deletion_audit` (see the deliberate deviation documented there).
 */
import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, text, timestamp, uuid, jsonb, check } from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';
import { users, plant, scan, photo } from './core';

// --- enums ---
export const chatRole = pgEnum('chat_role', ['user', 'assistant']);
export const healthVerdict = pgEnum('health_verdict', ['improved', 'worse', 'unchanged']);
export const notificationType = pgEnum('notification_type', ['watering', 'custom']);
export const notificationChannel = pgEnum('notification_channel', ['email', 'push']);
export const notificationStatus = pgEnum('notification_status', [
  'scheduled',
  'sent',
  'skipped',
  'failed',
]);
export const reportStatus = pgEnum('report_status', ['open', 'reviewed']);
export const deletionOutcome = pgEnum('deletion_outcome', ['completed', 'failed']);

// --- shared column groups (mirrors core.ts) ---
const pk = () => ({
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  publicId: uuid('public_id').notNull().unique().defaultRandom(),
});

// --- chat_conversation (US6 — per-plant AI chat) ---
export const chatConversation = pgTable('chat_conversation', {
  ...pk(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  plantId: text('plant_id')
    .notNull()
    .references(() => plant.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- chat_message (child of chat_conversation) ---
// context_photo_ids is capped at 2 elements (FR-012 "up to 2 photos") via a
// defense-in-depth CHECK constraint, even though the primary enforcement is
// application-level in the chat module.
export const chatMessage = pgTable(
  'chat_message',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => ulid()),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => chatConversation.id),
    role: chatRole('role').notNull(),
    content: text('content').notNull(),
    contextPhotoIds: text('context_photo_ids').array(),
    // usage_record lives in credits.ts; kept as a plain text pointer (no FK)
    // to avoid cross-file coupling between the support and credits schemas.
    // Nullable — only assistant messages that consumed credit have one.
    usageRecordId: text('usage_record_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chat_message_context_photo_ids_max_2',
      sql`${table.contextPhotoIds} IS NULL OR array_length(${table.contextPhotoIds}, 1) <= 2`,
    ),
  ],
);

// --- comparison_result (US5 — health-trend comparison) ---
export const comparisonResult = pgTable('comparison_result', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  scanId: text('scan_id')
    .notNull()
    .references(() => scan.id),
  plantId: text('plant_id')
    .notNull()
    .references(() => plant.id),
  verdict: healthVerdict('verdict').notNull(),
  referencedPhotoIds: text('referenced_photo_ids').array(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- notification (US7 — care reminders) ---
export const notification = pgTable('notification', {
  ...pk(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  plantId: text('plant_id').references(() => plant.id),
  type: notificationType('type').notNull(),
  channel: notificationChannel('channel').notNull(),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  status: notificationStatus('status').notNull().default('scheduled'),
  templateKey: text('template_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
});

// --- misidentification_report (US9 — admin review) ---
// user_id is nullable (T-022 correction): guest-submitted reports (US1, before
// registration) have no authenticated user, only the reported scan's public id.
export const misidentificationReport = pgTable('misidentification_report', {
  ...pk(),
  userId: text('user_id').references(() => users.id),
  scanId: text('scan_id')
    .notNull()
    .references(() => scan.id),
  photoId: text('photo_id').references(() => photo.id),
  aiResult: jsonb('ai_result'),
  note: text('note'),
  status: reportStatus('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- app_config (US9/FR-005/FR-027 — admin-editable operational settings) ---
// Natural key (`key`) as PK + jsonb `value`: new setting keys never require a
// schema migration, so admin config changes apply without a deploy.
export const appConfig = pgTable('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- analytics_event (cross-cutting, FR-028) ---
export const analyticsEvent = pgTable('analytics_event', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  // Nullable: guest-attributed events have no user.
  userId: text('user_id').references(() => users.id),
  name: text('name').notNull(),
  props: jsonb('props'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- deletion_audit (US8 — account deletion, FR-023) ---
// DELIBERATE DEVIATION from the standard convention: this table intentionally
// has NO `user_id` FK (the account row is purged by the time this survives)
// and NO standard `created_at`/`updated_at` audit columns (its own
// `requested_at`/`purged_at` timestamps serve that purpose instead). It is
// also deliberately PII-free: `user_public_id_hash` must be a deterministic
// one-way hash (e.g. SHA-256) of the deleted account's `public_id`, never the
// raw `public_id`, `email`, or any other PII. The hashing function itself is
// implemented by the later account-deletion task; this column is only shaped
// as `text` (not a raw UUID/FK) here.
export const deletionAudit = pgTable('deletion_audit', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  userPublicIdHash: text('user_public_id_hash').notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
  purgedAt: timestamp('purged_at', { withTimezone: true }),
  outcome: deletionOutcome('outcome'),
});
