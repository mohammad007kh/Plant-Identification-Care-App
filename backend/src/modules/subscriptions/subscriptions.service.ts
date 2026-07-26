import { Injectable } from '@nestjs/common';
import type { Plan } from 'shared';
import { SubscriptionsRepository } from './subscriptions.repository';

/**
 * Live subscription-plans read (T-080, FR-016/SC-006): `listActivePlans()`
 * reads `subscription_tier` fresh from Postgres on every call — no
 * cached/static plan array anywhere in this path, so an admin's allowance/price
 * edit (T-140) is reflected on the very next call with no deploy/restart.
 * Reused by `CreditCheckGuard` (T-082) to embed the same payload in a 402.
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly repo: SubscriptionsRepository) {}

  async listActivePlans(): Promise<Plan[]> {
    const rows = await this.repo.listActive();
    return rows.map((row) => ({
      id: row.publicId,
      key: row.key,
      monthlyCreditAllowance: row.monthlyCreditAllowance,
      priceMinor: row.priceMinor,
      currency: row.currency,
    }));
  }
}
