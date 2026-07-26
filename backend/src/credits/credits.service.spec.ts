import { afterAll, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { creditTransaction, usageRecord, users } from '../db/schema';
import { CreditLedgerRepository } from './credit-ledger.repository';
import { CreditsService } from './credits.service';
import { InsufficientCreditException } from './insufficient-credit.exception';

const ledger = new CreditLedgerRepository();
const credits = new CreditsService(ledger);
const created: string[] = [];

async function makeUser(): Promise<string> {
  const email = `t-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', creditBalance: 0 })
    .returning({ id: users.id });
  created.push(u.id);
  return u.id;
}

async function sumLedger(userId: string): Promise<number> {
  const rows = await db
    .select({ amount: creditTransaction.amount })
    .from(creditTransaction)
    .where(eq(creditTransaction.userId, userId));
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

afterAll(async () => {
  for (const id of created) {
    await db.delete(usageRecord).where(eq(usageRecord.userId, id));
    await db.delete(creditTransaction).where(eq(creditTransaction.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  await pool.end();
});

describe('CreditsService ledger (T-015, FR-015/FR-017)', () => {
  it('parallel debits never overspend (atomic conditional debit)', async () => {
    const userId = await makeUser();
    await credits.grant(userId, 5, { idempotencyKey: `grant:${userId}` });

    const settled = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        credits.debit(userId, 1, { idempotencyKey: `debit:${userId}:${i}` }),
      ),
    );
    const ok = settled.filter((s) => s.status === 'fulfilled').length;
    const rejected = settled.filter((s) => s.status === 'rejected');

    expect(ok).toBe(5);
    expect(rejected).toHaveLength(7);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientCreditException);
    }
    // Balance floored at 0, and the invariant balance == SUM(ledger) holds.
    expect(await credits.getBalance(userId)).toBe(0);
    expect(await sumLedger(userId)).toBe(0);
  });

  it('debit is idempotent by key (no double-charge on retry)', async () => {
    const userId = await makeUser();
    await credits.grant(userId, 5, { idempotencyKey: `grant:${userId}` });

    await credits.debit(userId, 2, { idempotencyKey: `k:${userId}` });
    await credits.debit(userId, 2, { idempotencyKey: `k:${userId}` }); // same key → no-op

    expect(await credits.getBalance(userId)).toBe(3);
    expect(await sumLedger(userId)).toBe(3);
  });

  it('runMeteredAction refunds on work failure — balance unchanged (FR-017)', async () => {
    const userId = await makeUser();
    await credits.grant(userId, 4, { idempotencyKey: `grant:${userId}` });

    await expect(
      credits.runMeteredAction({
        userId,
        action: 'identify',
        cost: 1,
        idempotencyKey: `act:${userId}`,
        work: async () => {
          throw new Error('AI provider down');
        },
      }),
    ).rejects.toThrow('AI provider down');

    expect(await credits.getBalance(userId)).toBe(4); // debited then refunded
    expect(await sumLedger(userId)).toBe(4);
  });

  it('runMeteredAction succeeds — credit stays debited', async () => {
    const userId = await makeUser();
    await credits.grant(userId, 4, { idempotencyKey: `grant:${userId}` });

    const result = await credits.runMeteredAction({
      userId,
      action: 'identify',
      cost: 1,
      idempotencyKey: `act:${userId}`,
      work: async () => 'ok',
    });

    expect(result).toBe('ok');
    expect(await credits.getBalance(userId)).toBe(3);
  });

  it('runMeteredAction rejects a repeated idempotency key without re-running paid work', async () => {
    const userId = await makeUser();
    await credits.grant(userId, 4, { idempotencyKey: `grant:${userId}` });

    let workCalls = 0;
    const params = {
      userId,
      action: 'identify' as const,
      cost: 1,
      idempotencyKey: `act:${userId}`,
      work: async () => {
        workCalls += 1;
        return 'ok';
      },
    };

    expect(await credits.runMeteredAction(params)).toBe('ok');
    // Same key again: must NOT re-run work, must NOT re-debit — surfaced as a conflict.
    await expect(credits.runMeteredAction(params)).rejects.toBeInstanceOf(ConflictException);

    expect(workCalls).toBe(1);
    expect(await credits.getBalance(userId)).toBe(3); // charged exactly once
    expect(await sumLedger(userId)).toBe(3);
  });

  it('refund is once-only (double refundUsage does not double-credit)', async () => {
    const userId = await makeUser();
    await credits.grant(userId, 4, { idempotencyKey: `grant:${userId}` });

    await expect(
      credits.runMeteredAction({
        userId,
        action: 'chat',
        cost: 2,
        idempotencyKey: `act:${userId}`,
        work: async () => {
          throw new Error('boom');
        },
      }),
    ).rejects.toThrow();

    const [record] = await db
      .select({ id: usageRecord.id })
      .from(usageRecord)
      .where(eq(usageRecord.userId, userId))
      .limit(1);
    // Explicit second refund attempt (as the reconciliation sweep might make) is a no-op.
    await credits.refundUsage(record.id);

    expect(await credits.getBalance(userId)).toBe(4);
    expect(await sumLedger(userId)).toBe(4);
  });
});
