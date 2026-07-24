/**
 * Core schema (T-010): users, guest_session, species, plant, scan, photo.
 *
 * Conventions (registry): internal PK = ULID `id` (app-generated); external id =
 * opaque UUID `public_id`; snake_case tables/columns; audit columns everywhere;
 * every user-owned row carries `user_id` (single-tenant boundary). Money is
 * integer minor units; time is UTC (`timestamptz`).
 */
import { sql } from 'drizzle-orm';
import {
  pgEnum,
  pgTable,
  text,
  integer,
  timestamp,
  uuid,
  jsonb,
  boolean,
  numeric,
} from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';

// --- enums ---
export const userRole = pgEnum('user_role', ['user', 'admin']);
export const deletionStatus = pgEnum('deletion_status', [
  'active',
  'pending_deletion',
  'purged',
]);
export const guestStatus = pgEnum('guest_status', ['active', 'converted']);
export const scanType = pgEnum('scan_type', ['identify', 'comparison']);
export const scanStatus = pgEnum('scan_status', ['pending', 'completed', 'failed']);

// --- shared column groups ---
const pk = () => ({
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  publicId: uuid('public_id').notNull().unique().defaultRandom(),
});
const audit = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- users ---
export const users = pgTable('users', {
  ...pk(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('user'),
  // subscription_tier FK is added by T-011 (subscription_tier table); kept as a
  // plain nullable column here to avoid a T-010 → T-011 circular dependency.
  subscriptionTierId: text('subscription_tier_id'),
  // denormalized cache of SUM(credit_transaction.amount); source of truth is the
  // ledger introduced in T-011. Integer minor units (credits are integers).
  creditBalance: integer('credit_balance').notNull().default(0),
  notifEmailEnabled: boolean('notif_email_enabled').notNull().default(true),
  notifPushEnabled: boolean('notif_push_enabled').notNull().default(true),
  deletionStatus: deletionStatus('deletion_status').notNull().default('active'),
  deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  ...audit(),
});

// --- guest_session ---
export const guestSession = pgTable('guest_session', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => ulid()),
  ipHash: text('ip_hash'),
  scanCount: integer('scan_count').notNull().default(0),
  status: guestStatus('status').notNull().default('active'),
  convertedToUserId: text('converted_to_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- species (admin-maintained catalog) ---
export const species = pgTable('species', {
  ...pk(),
  scientificName: text('scientific_name').notNull(),
  commonNameFa: text('common_name_fa'),
  careGuide: jsonb('care_guide'),
  createdBy: text('created_by').references(() => users.id),
  ...audit(),
});

// --- plant (owned by a user) ---
export const plant = pgTable('plant', {
  ...pk(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  speciesId: text('species_id').references(() => species.id),
  nickname: text('nickname'),
  ...audit(),
});

// --- scan (an identification or comparison event) ---
export const scan = pgTable('scan', {
  ...pk(),
  userId: text('user_id').references(() => users.id),
  guestSessionId: text('guest_session_id').references(() => guestSession.id),
  plantId: text('plant_id').references(() => plant.id),
  type: scanType('type').notNull(),
  status: scanStatus('status').notNull().default('pending'),
  speciesId: text('species_id').references(() => species.id),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  result: jsonb('result'),
  // FK to photo intentionally omitted to avoid a scan<->photo circular FK; the
  // primary photo is resolvable via photo.scan_id. Kept as a plain id pointer.
  photoId: text('photo_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- photo (belongs to a plant's history and/or a scan) ---
export const photo = pgTable('photo', {
  ...pk(),
  plantId: text('plant_id').references(() => plant.id),
  scanId: text('scan_id').references(() => scan.id),
  storageKey: text('storage_key').notNull(),
  contentType: text('content_type'),
  bytes: integer('bytes'),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Re-export sql for downstream schema files that need raw defaults.
export { sql };
