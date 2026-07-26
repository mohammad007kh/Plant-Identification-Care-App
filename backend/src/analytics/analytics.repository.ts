import { Injectable } from '@nestjs/common';
import type { AnalyticsEventName, AnalyticsEventProps } from 'shared';
import { db } from '../db/client';
import { analyticsEvent } from '../db/schema';

export interface InsertAnalyticsEventParams {
  /** Nullable: guest-attributed events have no user (mirrors `analytics_event.user_id`). */
  userId: string | null;
  name: AnalyticsEventName;
  props: AnalyticsEventProps;
}

/**
 * All Drizzle access for the `analytics_event` table (repository pattern —
 * no naked ORM outside `*.repository.ts` per `code_patterns.data_access`).
 * `createdAt` is DB-assigned (`defaultNow()`, UTC, `timestamptz`), so no
 * timestamp handling is needed here.
 */
@Injectable()
export class AnalyticsRepository {
  async insertEvent(params: InsertAnalyticsEventParams): Promise<void> {
    await db.insert(analyticsEvent).values({
      userId: params.userId,
      name: params.name,
      props: params.props,
    });
  }
}
