/**
 * Credits & billing schema (T-011): subscription_tier, credit_transaction,
 * usage_record, payment_event.
 *
 * Conventions (registry, matching core.ts / T-010): internal PK = ULID `id`
 * (app-generated); external id = opaque UUID `public_id` (only on tables that
 * are exposed to clients directly); snake_case tables/columns; money is
 * integer minor units; time is UTC (`timestamptz`).
 *
 * Tables are declared in dependency order so FK targets exist before use:
 * subscription_tier -> credit_transaction -> usage_record -> payment_event.
 *
 * Requirement mapping: FR-014 (admin-configurable monthly credit allowance
 * per subscription tier).
 */
import {
  pgEnum,
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  jsonb,
  boolean,
} from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';
import { users } from './core';

// --- enums ---
export const subscriptionTierKey = pgEnum('subscription_tier_key', ['free', 'pro', 'max']);
export const creditTxnType = pgEnum('credit_txn_type', ['grant', 'debit', 'refund', 'expiry']);
export const creditRelatedType = pgEnum('credit_related_type', [
  'scan',
  'chat_message',
  'comparison',
  'subscription',
  'monthly_reset',
]);
export const usageAction = pgEnum('usage_action', ['identify', 'comparison', 'chat']);
export const usageStatus = pgEnum('usage_status', ['pending', 'completed', 'failed']);
export const paymentStatus = pgEnum('payment_status', ['initiated', 'verified', 'failed']);

// --- subscription_tier (the plans themselves; admin-configurable, FR-014) ---
export const subscriptionTier = pgTable('subscription_tier', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  publicId: uuid('public_id').notNull().unique().defaultRandom(),
  key: subscriptionTierKey('key').notNull().unique(),
  monthlyCreditAllowance: integer('monthly_credit_allowance').notNull(),
  priceMinor: integer('price_minor').notNull().default(0),
  currency: text('currency').notNull().default('IRR'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- credit_transaction (append-only ledger; source of truth for credit movement) ---
export const creditTransaction = pgTable('credit_transaction', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  // signed integer: grant/refund > 0, debit < 0. No CHECK constraint — both
  // directions are valid and expected.
  amount: integer('amount').notNull(),
  type: creditTxnType('type').notNull(),
  relatedType: creditRelatedType('related_type'),
  relatedId: text('related_id'),
  // prevents double-posting the same logical transaction.
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- usage_record (AI action state machine: pending -> completed | failed) ---
export const usageRecord = pgTable('usage_record', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  action: usageAction('action').notNull(),
  status: usageStatus('status').notNull().default('pending'),
  debitTxnId: text('debit_txn_id').references(() => creditTransaction.id),
  // unique (nullable) -> at most one refund per usage record (refund-once).
  refundTxnId: text('refund_txn_id').unique().references(() => creditTransaction.id),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

// --- payment_event (ledger for mock-Zarinpal payment attempts) ---
export const paymentEvent = pgTable('payment_event', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  publicId: uuid('public_id').notNull().unique().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  provider: text('provider').notNull(),
  // Authority/RefID from the provider.
  providerRef: text('provider_ref'),
  planId: text('plan_id').references(() => subscriptionTier.id),
  priceSnapshotMinor: integer('price_snapshot_minor').notNull(),
  creditAllowanceSnapshot: integer('credit_allowance_snapshot').notNull(),
  status: paymentStatus('status').notNull().default('initiated'),
  rawPayload: jsonb('raw_payload'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
