import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUserActionRequest, AdminUserSummary } from 'shared';
import { UsersAdminRepository, type AdminUserRow } from './users-admin.repository';

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

/** Never includes `passwordHash` or the internal ULID `id` (Station 13 "no secret leakage" rule). */
function toSummary(row: AdminUserRow): AdminUserSummary {
  return {
    publicId: row.publicId,
    email: row.email,
    role: row.role,
    status: row.status,
    tier: row.tier,
    creditBalance: row.creditBalance,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Admin user search/detail/action (US9, FR-026). Pure orchestration over
 * `UsersAdminRepository` — no direct Drizzle access here (repository
 * pattern). Every mutating action (`act`) is audited: the acting admin's id,
 * the caller-supplied reason, and exactly what changed are written before the
 * response is returned, never best-effort/fire-and-forget.
 */
@Injectable()
export class UsersAdminService {
  constructor(private readonly repo: UsersAdminRepository) {}

  async search(
    q: string | null,
    cursor: string | null,
    limit: number,
  ): Promise<CursorPage<AdminUserSummary>> {
    const { rows, nextCursor } = await this.repo.search(q, cursor, limit);
    return { data: rows.map(toSummary), nextCursor };
  }

  async getOne(publicId: string): Promise<AdminUserSummary> {
    const row = await this.repo.findByPublicId(publicId);
    if (!row) throw new NotFoundException('admin.user.notFound');
    return toSummary(row);
  }

  /**
   * Applies a `tier` change and/or a `creditAdjustment` delta, then records the
   * audit event. `req` already validated non-empty (Zod's `.refine`) by the
   * controller — at least one of `tier`/`creditAdjustment` is always present.
   */
  async act(
    actingAdminUserId: string,
    targetPublicId: string,
    req: AdminUserActionRequest,
  ): Promise<AdminUserSummary> {
    const target = await this.repo.findByPublicId(targetPublicId);
    if (!target) throw new NotFoundException('admin.user.notFound');

    const changes: Record<string, unknown> = {};

    if (req.creditAdjustment !== undefined) {
      const newBalance = target.creditBalance + req.creditAdjustment;
      if (newBalance < 0) {
        throw new BadRequestException({
          code: 'insufficient_balance',
          message: 'creditAdjustment would drive the balance negative',
        });
      }
      await this.repo.setCreditBalance(target.id, newBalance);
      changes.creditAdjustment = req.creditAdjustment;
      changes.newCreditBalance = newBalance;
    }

    if (req.tier !== undefined) {
      const applied = await this.repo.updateTier(target.id, req.tier);
      if (!applied) throw new NotFoundException('admin.tier.notFound');
      changes.tier = req.tier;
    }

    await this.repo.recordAuditEvent({
      actingAdminUserId,
      targetUserId: target.id,
      reason: req.reason,
      changes,
    });

    const updated = await this.repo.findByPublicId(targetPublicId);
    if (!updated) throw new NotFoundException('admin.user.notFound');
    return toSummary(updated);
  }
}
