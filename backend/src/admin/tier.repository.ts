import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { TierKey } from 'shared';
import { db } from '../db/client';
import { subscriptionTier } from '../db/schema';

export interface TierRow {
  publicId: string;
  key: TierKey;
  monthlyCreditAllowance: number;
  priceMinor: number;
  currency: string;
  active: boolean;
}

const tierColumns = {
  publicId: subscriptionTier.publicId,
  key: subscriptionTier.key,
  monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
  priceMinor: subscriptionTier.priceMinor,
  currency: subscriptionTier.currency,
  active: subscriptionTier.active,
};

export interface UpdateTierParams {
  monthlyCreditAllowance?: number;
  priceMinor?: number;
  active?: boolean;
}

/**
 * All Drizzle access for `subscription_tier` (repository pattern). Backs the
 * admin-configurable per-tier monthly credit allowance (FR-014/FR-019) read
 * live by the billing/credit-grant path — a write here applies to the NEXT
 * grant with no deploy.
 *
 * NOTE: `subscription_tier` (T-011) carries no `updated_by`/`created_by`
 * columns — only `updated_at`, which `updateByKey` touches. Recording WHICH
 * admin changed a tier would need a schema migration outside this task's
 * scope; flagged for a follow-up task (same gap as `species`, see
 * `species.repository.ts`).
 */
@Injectable()
export class TierRepository {
  async list(): Promise<TierRow[]> {
    return db
      .select(tierColumns)
      .from(subscriptionTier)
      .orderBy(asc(subscriptionTier.monthlyCreditAllowance));
  }

  async updateByKey(key: TierKey, patch: UpdateTierParams): Promise<TierRow | null> {
    const [row] = await db
      .update(subscriptionTier)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(subscriptionTier.key, key))
      .returning(tierColumns);
    return row ?? null;
  }
}
