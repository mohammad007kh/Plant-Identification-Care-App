import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, type Db } from '../db/client';
import { creditTransaction, usageRecord, users } from '../db/schema';
import { InsufficientCreditException } from './insufficient-credit.exception';
import { isUniqueViolation } from './db-errors';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type CreditRelatedType =
  'scan' | 'chat_message' | 'comparison' | 'subscription' | 'monthly_reset';

interface DebitParams {
  userId: string;
  amount: number;
  idempotencyKey: string;
  relatedType?: CreditRelatedType;
  relatedId?: string;
}

interface CreditParams extends DebitParams {
  type: 'grant' | 'refund' | 'expiry';
}

/**
 * Append-only credit ledger. `credit_transaction` rows are immutable; the
 * denormalized `users.credit_balance` cache is updated in the SAME transaction
 * as each ledger insert, so the invariant `balance == SUM(ledger)` always holds.
 *
 * Debit is a single conditional UPDATE (`... WHERE credit_balance >= amount`)
 * that takes a Postgres row lock — concurrent debits on the same user serialize,
 * so parallel requests can never overspend. Every write carries a unique
 * `idempotency_key`; a retried request finds the existing row instead of
 * double-posting (no free infinite retries).
 */
@Injectable()
export class CreditLedgerRepository {
  async getBalance(userId: string): Promise<number> {
    const [row] = await db
      .select({ balance: users.creditBalance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new NotFoundException('user not found');
    return row.balance;
  }

  /** Atomic conditional debit + append-only ledger row. Idempotent by key. */
  async debit(params: DebitParams): Promise<{ txnId: string; balance: number }> {
    try {
      return await db.transaction((tx) => this.debitTx(tx, params));
    } catch (err) {
      // Concurrent same-key request committed first (TOCTOU on the SELECT-then-INSERT):
      // Postgres rolled our tx back, so the ledger stays consistent — return the winner idempotently.
      if (isUniqueViolation(err)) return this.findByKey(params.userId, params.idempotencyKey);
      throw err;
    }
  }

  /** Debit inside a caller-provided transaction (used by runMeteredAction). */
  async debitTx(tx: Tx, params: DebitParams): Promise<{ txnId: string; balance: number }> {
    const existing = await tx
      .select({ id: creditTransaction.id })
      .from(creditTransaction)
      .where(eq(creditTransaction.idempotencyKey, params.idempotencyKey))
      .limit(1);
    if (existing.length > 0) {
      return { txnId: existing[0].id, balance: await this.getBalanceTx(tx, params.userId) };
    }

    const updated = await tx
      .update(users)
      .set({ creditBalance: sql`${users.creditBalance} - ${params.amount}` })
      .where(and(eq(users.id, params.userId), gte(users.creditBalance, params.amount)))
      .returning({ balance: users.creditBalance });

    if (updated.length === 0) {
      throw new InsufficientCreditException();
    }

    const [txn] = await tx
      .insert(creditTransaction)
      .values({
        userId: params.userId,
        amount: -Math.abs(params.amount),
        type: 'debit',
        relatedType: params.relatedType ?? null,
        relatedId: params.relatedId ?? null,
        idempotencyKey: params.idempotencyKey,
      })
      .returning({ id: creditTransaction.id });

    return { txnId: txn.id, balance: updated[0].balance };
  }

  /** Atomic positive ledger entry (grant / refund / expiry-reversal). Idempotent by key. */
  async credit(params: CreditParams): Promise<{ txnId: string; balance: number }> {
    try {
      return await db.transaction((tx) => this.creditTx(tx, params));
    } catch (err) {
      if (isUniqueViolation(err)) return this.findByKey(params.userId, params.idempotencyKey);
      throw err;
    }
  }

  async creditTx(tx: Tx, params: CreditParams): Promise<{ txnId: string; balance: number }> {
    const existing = await tx
      .select({ id: creditTransaction.id })
      .from(creditTransaction)
      .where(eq(creditTransaction.idempotencyKey, params.idempotencyKey))
      .limit(1);
    if (existing.length > 0) {
      return { txnId: existing[0].id, balance: await this.getBalanceTx(tx, params.userId) };
    }

    const updated = await tx
      .update(users)
      .set({ creditBalance: sql`${users.creditBalance} + ${params.amount}` })
      .where(eq(users.id, params.userId))
      .returning({ balance: users.creditBalance });
    if (updated.length === 0) throw new NotFoundException('user not found');

    const [txn] = await tx
      .insert(creditTransaction)
      .values({
        userId: params.userId,
        amount: Math.abs(params.amount),
        type: params.type,
        relatedType: params.relatedType ?? null,
        relatedId: params.relatedId ?? null,
        idempotencyKey: params.idempotencyKey,
      })
      .returning({ id: creditTransaction.id });

    return { txnId: txn.id, balance: updated[0].balance };
  }

  /** Look up an already-posted ledger row by its idempotency key (used after a lost TOCTOU race). */
  private async findByKey(
    userId: string,
    idempotencyKey: string,
  ): Promise<{ txnId: string; balance: number }> {
    const [txn] = await db
      .select({ id: creditTransaction.id })
      .from(creditTransaction)
      .where(eq(creditTransaction.idempotencyKey, idempotencyKey))
      .limit(1);
    if (!txn) throw new NotFoundException('credit transaction not found');
    return { txnId: txn.id, balance: await this.getBalance(userId) };
  }

  private async getBalanceTx(tx: Tx, userId: string): Promise<number> {
    const [row] = await tx
      .select({ balance: users.creditBalance })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) throw new NotFoundException('user not found');
    return row.balance;
  }

  /** Expose helpers for the credits service's runMeteredAction transaction. */
  get tables() {
    return { creditTransaction, usageRecord, users };
  }
}
