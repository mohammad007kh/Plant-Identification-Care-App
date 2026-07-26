import { Injectable } from '@nestjs/common';
import { asc, eq, gt } from 'drizzle-orm';
import type { TierKey } from 'shared';
import { db } from '../db/client';
import { subscriptionTier, users } from '../db/schema';

export interface UserForReset {
  id: string;
  subscriptionTierId: string | null;
}

/** All Drizzle access for the monthly credit reset job (repository pattern). */
@Injectable()
export class MonthlyCreditResetRepository {
  /**
   * Cursor-paginated page of users (by internal id, ascending) — never loads
   * the whole `users` table into memory at once. `subscriptionTierId` is
   * nullable (no default tier is assigned at registration yet); the processor
   * resolves a null tier to the `free` tier's current allowance.
   */
  async findUserBatch(cursor: string | null, limit: number): Promise<UserForReset[]> {
    const columns = { id: users.id, subscriptionTierId: users.subscriptionTierId };
    if (cursor) {
      return db
        .select(columns)
        .from(users)
        .where(gt(users.id, cursor))
        .orderBy(asc(users.id))
        .limit(limit);
    }
    return db.select(columns).from(users).orderBy(asc(users.id)).limit(limit);
  }

  /** Current admin-configured allowance for a tier by its internal id (FR-019: read live, no caching). */
  async findTierAllowanceById(tierId: string): Promise<number | null> {
    const [row] = await db
      .select({ allowance: subscriptionTier.monthlyCreditAllowance })
      .from(subscriptionTier)
      .where(eq(subscriptionTier.id, tierId))
      .limit(1);
    return row?.allowance ?? null;
  }

  /** Same, looked up by the tier's enum key (used for the implicit-free-tier fallback). */
  async findTierAllowanceByKey(key: TierKey): Promise<number | null> {
    const [row] = await db
      .select({ allowance: subscriptionTier.monthlyCreditAllowance })
      .from(subscriptionTier)
      .where(eq(subscriptionTier.key, key))
      .limit(1);
    return row?.allowance ?? null;
  }
}
