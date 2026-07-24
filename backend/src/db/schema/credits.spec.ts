import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from './credits';
import { subscriptionTier, creditTransaction, usageRecord, paymentEvent } from './credits';

describe('credits schema (T-011)', () => {
  it('exports all four credits/billing tables', () => {
    for (const t of [
      'subscriptionTier',
      'creditTransaction',
      'usageRecord',
      'paymentEvent',
    ] as const) {
      expect(schema[t], `table ${t} should be exported`).toBeDefined();
    }
  });

  it('uses snake_case physical table names', () => {
    expect(getTableConfig(subscriptionTier).name).toBe('subscription_tier');
    expect(getTableConfig(creditTransaction).name).toBe('credit_transaction');
    expect(getTableConfig(usageRecord).name).toBe('usage_record');
    expect(getTableConfig(paymentEvent).name).toBe('payment_event');
  });

  it('subscription_tier carries key + admin-configurable monthly_credit_allowance (FR-014)', () => {
    const cols = getTableConfig(subscriptionTier).columns.map((c) => c.name);
    for (const c of [
      'id',
      'public_id',
      'key',
      'monthly_credit_allowance',
      'price_minor',
      'currency',
      'active',
      'created_at',
      'updated_at',
    ]) {
      expect(cols, `subscription_tier.${c}`).toContain(c);
    }
  });

  it('credit_transaction is an append-only ledger with idempotency_key + signed amount + type', () => {
    const cols = getTableConfig(creditTransaction).columns.map((c) => c.name);
    for (const c of [
      'id',
      'user_id',
      'amount',
      'type',
      'related_type',
      'related_id',
      'idempotency_key',
      'created_at',
    ]) {
      expect(cols, `credit_transaction.${c}`).toContain(c);
    }
    // append-only ledger: no updatedAt column.
    expect(cols).not.toContain('updated_at');
  });

  it('usage_record is an AI-action state machine carrying refund_txn_id', () => {
    const cols = getTableConfig(usageRecord).columns.map((c) => c.name);
    for (const c of [
      'id',
      'user_id',
      'action',
      'status',
      'debit_txn_id',
      'refund_txn_id',
      'idempotency_key',
      'created_at',
      'resolved_at',
    ]) {
      expect(cols, `usage_record.${c}`).toContain(c);
    }
  });

  it('payment_event snapshots price/allowance and carries idempotency_key', () => {
    const cols = getTableConfig(paymentEvent).columns.map((c) => c.name);
    for (const c of [
      'id',
      'public_id',
      'user_id',
      'provider',
      'provider_ref',
      'plan_id',
      'price_snapshot_minor',
      'credit_allowance_snapshot',
      'status',
      'raw_payload',
      'idempotency_key',
      'created_at',
    ]) {
      expect(cols, `payment_event.${c}`).toContain(c);
    }
  });
});
