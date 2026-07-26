import { Injectable } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { guestSession } from '../../db/schema';

export interface GuestSessionRow {
  id: string;
  scanCount: number;
  status: 'active' | 'converted';
}

/** All Drizzle access to `guest_session` (repository pattern). */
@Injectable()
export class GuestSessionRepository {
  async create(id: string, ipHash: string): Promise<void> {
    await db.insert(guestSession).values({ id, ipHash, scanCount: 0, status: 'active' });
  }

  async findById(id: string): Promise<GuestSessionRow | null> {
    const [row] = await db
      .select({
        id: guestSession.id,
        scanCount: guestSession.scanCount,
        status: guestSession.status,
      })
      .from(guestSession)
      .where(eq(guestSession.id, id))
      .limit(1);
    return row ?? null;
  }

  /**
   * Atomic guarded increment: `UPDATE ... SET scan_count = scan_count + 1
   * WHERE id = $1 AND scan_count < $limit RETURNING scan_count`. Returns the new
   * count, or null when the guard failed (already at the limit). The row lock the
   * UPDATE takes serializes concurrent scans, so a 3rd can never slip through.
   */
  async incrementIfBelow(id: string, limit: number): Promise<number | null> {
    const rows = await db
      .update(guestSession)
      .set({ scanCount: sql`${guestSession.scanCount} + 1` })
      .where(and(eq(guestSession.id, id), lt(guestSession.scanCount, limit)))
      .returning({ scanCount: guestSession.scanCount });
    return rows.length > 0 ? rows[0].scanCount : null;
  }
}
