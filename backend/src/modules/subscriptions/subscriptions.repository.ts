import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { TierKey } from 'shared';
import { db } from '../../db/client';
import { subscriptionTier } from '../../db/schema';

export interface ActiveTierRow {
  publicId: string;
  key: TierKey;
  monthlyCreditAllowance: number;
  priceMinor: number;
  currency: string;
}

const activeTierColumns = {
  publicId: subscriptionTier.publicId,
  key: subscriptionTier.key,
  monthlyCreditAllowance: subscriptionTier.monthlyCreditAllowance,
  priceMinor: subscriptionTier.priceMinor,
  currency: subscriptionTier.currency,
};

/**
 * All Drizzle access for the public (unauthenticated) subscription plans read
 * (T-080, FR-016). Distinct from admin's `TierRepository` (T-140), which also
 * surfaces inactive tiers for management — this repository is the public
 * read-path contract: only `active = true` rows, ordered for a predictable
 * free -> pro -> max display order.
 */
@Injectable()
export class SubscriptionsRepository {
  async listActive(): Promise<ActiveTierRow[]> {
    return db
      .select(activeTierColumns)
      .from(subscriptionTier)
      .where(eq(subscriptionTier.active, true))
      .orderBy(asc(subscriptionTier.priceMinor));
  }
}
