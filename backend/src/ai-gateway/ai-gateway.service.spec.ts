import { afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db/client';
import { creditTransaction, usageRecord, users } from '../db/schema';
import { CreditLedgerRepository } from '../credits/credit-ledger.repository';
import { CreditsService } from '../credits/credits.service';
import { AiGatewayService } from './ai-gateway.service';
import type {
  ChatResult,
  CompareResult,
  IdentifyResult,
  PlantAIProvider,
} from './plant-ai-provider.interface';

const credits = new CreditsService(new CreditLedgerRepository());
const created: string[] = [];

async function makeUserWithCredits(amount: number): Promise<string> {
  const email = `g-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', creditBalance: 0 })
    .returning({ id: users.id });
  created.push(u.id);
  await credits.grant(u.id, amount, { idempotencyKey: `grant:${u.id}` });
  return u.id;
}

/** Configurable stub provider for gate + failure paths. */
function provider(overrides: Partial<PlantAIProvider> & { confidence?: number }): PlantAIProvider {
  return {
    identify: async (): Promise<IdentifyResult> => ({
      confidence: overrides.confidence ?? 0.92,
      speciesId: 'species-123',
      careGuide: { watering: 'weekly' },
    }),
    compareHealth: async (): Promise<CompareResult> => ({ verdict: 'unchanged' }),
    chat: async (): Promise<ChatResult> => ({ content: 'ok' }),
    ...overrides,
  };
}

afterAll(async () => {
  for (const id of created) {
    await db.delete(usageRecord).where(eq(usageRecord.userId, id));
    await db.delete(creditTransaction).where(eq(creditTransaction.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  await pool.end();
});

describe('AiGatewayService (T-015, FR-002/FR-003)', () => {
  it('withholds species below the 70% confidence gate', async () => {
    const gateway = new AiGatewayService(provider({ confidence: 0.6 }), credits);
    const result = await gateway.identify(Buffer.from('photo'));
    expect(result.lowConfidence).toBe(true);
    expect(result.speciesId).toBeNull();
    expect(result.careGuide).toBeNull();
  });

  it('returns species at or above the confidence gate', async () => {
    const gateway = new AiGatewayService(provider({ confidence: 0.9 }), credits);
    const result = await gateway.identify(Buffer.from('photo'));
    expect(result.lowConfidence).toBe(false);
    expect(result.speciesId).toBe('species-123');
    expect(result.careGuide).toEqual({ watering: 'weekly' });
  });

  it('refunds credit when the metered AI call fails (balance unchanged)', async () => {
    const failing = provider({
      identify: async () => {
        throw new Error('model unavailable');
      },
    });
    const gateway = new AiGatewayService(failing, credits);
    const userId = await makeUserWithCredits(3);

    await expect(
      gateway.runMeteredAction({
        userId,
        action: 'identify',
        cost: 1,
        idempotencyKey: `g-act:${userId}`,
        work: () => gateway.identify(Buffer.from('photo')),
      }),
    ).rejects.toThrow('model unavailable');

    expect(await credits.getBalance(userId)).toBe(3);
  });
});
