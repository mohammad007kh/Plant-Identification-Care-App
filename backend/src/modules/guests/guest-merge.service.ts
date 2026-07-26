import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { guestSession, scan } from '../../db/schema';

/**
 * Re-parents a guest session's scans to a newly registered user (FR-008),
 * guaranteeing zero scan loss. Runs synchronously as part of registration.
 *
 * Convert-once + race safety: the whole merge happens in ONE transaction with
 * the guest_session row locked `FOR UPDATE`. A concurrent duplicate registration
 * (double-submit) blocks on the lock, then sees status !== 'active' and is a
 * no-op — so scans are never re-parented twice or duplicated. A missing/absent
 * guest session (never scanned as a guest) is also a clean no-op.
 */
@Injectable()
export class GuestMergeService {
  private readonly logger = new Logger(GuestMergeService.name);

  /** Returns the number of scans re-parented (0 when no-op). */
  async mergeGuestSessionIntoUser(
    guestSessionId: string | null,
    newUserId: string,
  ): Promise<number> {
    if (!guestSessionId) return 0;

    return db.transaction(async (tx) => {
      const [session] = await tx
        .select({ id: guestSession.id, status: guestSession.status })
        .from(guestSession)
        .where(eq(guestSession.id, guestSessionId))
        .for('update')
        .limit(1);

      // Unknown session or already converted → no-op (convert-once).
      if (!session || session.status !== 'active') return 0;

      const reparented = await tx
        .update(scan)
        .set({ userId: newUserId, guestSessionId: null })
        .where(eq(scan.guestSessionId, guestSessionId))
        .returning({ id: scan.id });

      await tx
        .update(guestSession)
        .set({ status: 'converted', convertedToUserId: newUserId })
        .where(eq(guestSession.id, guestSessionId));

      this.logger.log(`Merged ${reparented.length} guest scan(s) into user ${newUserId}.`);
      return reparented.length;
    });
  }
}
