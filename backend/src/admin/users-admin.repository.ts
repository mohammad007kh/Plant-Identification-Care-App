import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, lt, or } from 'drizzle-orm';
import type { TierKey } from 'shared';
import { db } from '../db/client';
import { analyticsEvent, subscriptionTier, users } from '../db/schema';

export interface AdminUserRow {
  /** Internal ULID — never exposed outside this module (see `toSummary`). */
  id: string;
  publicId: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'pending_deletion' | 'purged';
  tier: TierKey | null;
  creditBalance: number;
  createdAt: Date;
}

export interface AdminUsersPage {
  rows: AdminUserRow[];
  nextCursor: string | null;
}

export interface RecordAuditEventParams {
  /** Internal id of the admin who performed the action. */
  actingAdminUserId: string;
  /** Internal id of the affected user. */
  targetUserId: string;
  reason: string;
  changes: Record<string, unknown>;
}

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: Pick<AdminUserRow, 'createdAt' | 'id'>): string {
  const payload: Cursor = { createdAt: row.createdAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    if (Number.isNaN(new Date(parsed.createdAt).getTime())) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const userColumns = {
  id: users.id,
  publicId: users.publicId,
  email: users.email,
  role: users.role,
  status: users.deletionStatus,
  tier: subscriptionTier.key,
  creditBalance: users.creditBalance,
  createdAt: users.createdAt,
};

/**
 * All Drizzle access for admin user search/detail/action (US9, FR-026).
 * Cross-user reads are the entire point here (Station 17 "admin routes are
 * cross-user by design" note) — unlike every other repository in this app,
 * there is deliberately no `userId`-scoping on these queries; the caller is
 * always an already-`AdminGuard`-checked admin.
 *
 * Audit events are written to the existing `analytics_event` table (T-012)
 * rather than a dedicated `admin_audit_log` — this task adds no schema
 * migration, and `analytics_event`'s free-form `(name, props)` shape already
 * fits an audit record (`name: 'admin.user_action'`, `props` carrying the
 * acting admin id + reason + applied changes). Flagged as a follow-up: a
 * dedicated audit table would give stronger guarantees (e.g. immutability,
 * a NOT NULL admin id) than this reuse does.
 */
@Injectable()
export class UsersAdminRepository {
  /**
   * Cursor-paginated user search, ordered by `created_at DESC`. `q` matches
   * `email` (case-insensitive substring) and, when `q` looks like a UUID, an
   * exact `public_id` match as well (FR-026 "search by email/public_id").
   */
  async search(q: string | null, cursor: string | null, limit: number): Promise<AdminUsersPage> {
    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      throw new BadRequestException({ code: 'invalid_cursor', message: 'cursor is malformed' });
    }

    const conditions = [];
    if (q) {
      const byEmail = ilike(users.email, `%${q}%`);
      conditions.push(UUID_RE.test(q) ? or(byEmail, eq(users.publicId, q)) : byEmail);
    }
    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      conditions.push(
        or(
          lt(users.createdAt, cursorDate),
          and(eq(users.createdAt, cursorDate), lt(users.id, decoded.id)),
        ),
      );
    }

    const rows = await db
      .select(userColumns)
      .from(users)
      .leftJoin(subscriptionTier, eq(users.subscriptionTierId, subscriptionTier.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;
    return { rows: page, nextCursor };
  }

  /** Resolves `public_id` → row. Returns null if no such user exists. */
  async findByPublicId(publicId: string): Promise<AdminUserRow | null> {
    const [row] = await db
      .select(userColumns)
      .from(users)
      .leftJoin(subscriptionTier, eq(users.subscriptionTierId, subscriptionTier.id))
      .where(eq(users.publicId, publicId))
      .limit(1);
    return row ?? null;
  }

  /** Sets `credit_balance` to an already-validated absolute value (caller computes the delta). */
  async setCreditBalance(userId: string, newBalance: number): Promise<void> {
    await db
      .update(users)
      .set({ creditBalance: newBalance, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  /** Re-points `subscription_tier_id` at the tier matching `tierKey`. Returns false if unknown. */
  async updateTier(userId: string, tierKey: TierKey): Promise<boolean> {
    const [tier] = await db
      .select({ id: subscriptionTier.id })
      .from(subscriptionTier)
      .where(eq(subscriptionTier.key, tierKey))
      .limit(1);
    if (!tier) return false;

    await db
      .update(users)
      .set({ subscriptionTierId: tier.id, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return true;
  }

  /**
   * Persists an audit record for a mutating admin action (Station 17 "every
   * mutating admin action writes an audit record" rule). See class doc for why
   * this reuses `analytics_event` rather than a dedicated table.
   */
  async recordAuditEvent(params: RecordAuditEventParams): Promise<void> {
    await db.insert(analyticsEvent).values({
      userId: params.targetUserId,
      name: 'admin.user_action',
      props: {
        adminUserId: params.actingAdminUserId,
        reason: params.reason,
        changes: params.changes,
      },
    });
  }
}
