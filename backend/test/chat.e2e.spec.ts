process.env.DISABLE_WORKERS = '1';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://plant:plant@localhost:25432/plant';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:26379';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, pool } from '../src/db/client';
import {
  appConfig,
  chatConversation,
  chatMessage,
  creditTransaction,
  plant,
  usageRecord,
  users,
} from '../src/db/schema';
import { ChatModule } from '../src/chat/chat.module';
import { ChatQueue, type ChatJobData } from '../src/chat/chat.queue';
import { ChatService } from '../src/chat/chat.service';
import { PLANT_AI_PROVIDER } from '../src/ai-gateway/plant-ai-provider.interface';
import { StorageService } from '../src/common/uploads/storage.service';
import { CreditsService } from '../src/credits/credits.service';

const SECRET = process.env.JWT_ACCESS_SECRET as string;

// Mutable AI provider stub: each test sets the next chat() outcome.
const aiMock = {
  identify: async () => ({ confidence: 0.9, speciesId: null, careGuide: {} }),
  compareHealth: async () => ({ verdict: 'unchanged' as const }),
  chat: async () => nextChat(),
};
let nextChat: () => Promise<{ content: string }>;

let lastJob: ChatJobData | undefined;
const queueMock = {
  enqueueChat: async (data: ChatJobData) => {
    lastJob = data;
  },
  onModuleDestroy: async () => {},
};
const storageMock = {
  put: async () => 'test-key',
  getBytes: async () => Buffer.from('img'),
  getCommand: async () => ({}),
};

let app: INestApplication;
let chatService: ChatService;
let credits: CreditsService;
const createdUsers: string[] = [];
const createdPlants: string[] = [];

const publicIdByUser = new Map<string, string>();

async function makeUser(creditBalance: number): Promise<string> {
  const email = `chat-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`;
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: 'x', creditBalance: 0 })
    .returning({ id: users.id, publicId: users.publicId });
  createdUsers.push(u.id);
  publicIdByUser.set(u.id, u.publicId);
  if (creditBalance > 0) {
    await credits.grant(u.id, creditBalance, { idempotencyKey: `grant:${u.id}` });
  }
  return u.id;
}

async function makePlant(userId: string): Promise<string> {
  const [p] = await db.insert(plant).values({ userId, nickname: 'My Ficus' }).returning({
    id: plant.id,
    publicId: plant.publicId,
  });
  createdPlants.push(p.id);
  return p.publicId;
}

function bearer(userId: string): string {
  const publicId = publicIdByUser.get(userId) ?? userId;
  return `Bearer ${jwt.sign({ sub: publicId, typ: 'access' }, SECRET, { algorithm: 'HS256' })}`;
}

let idemCounter = 0;
function nextIdemKey(): string {
  idemCounter += 1;
  return `chat-e2e-idem-${Date.now()}-${idemCounter}`;
}

beforeAll(async () => {
  await db
    .insert(appConfig)
    .values({ key: 'credit_costs', value: { identify: 1, chat: 1, comparison: 1 } })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: { identify: 1, chat: 1, comparison: 1 } },
    });

  const moduleRef = await Test.createTestingModule({ imports: [ChatModule] })
    .overrideProvider(PLANT_AI_PROVIDER)
    .useValue(aiMock)
    .overrideProvider(StorageService)
    .useValue(storageMock)
    .overrideProvider(ChatQueue)
    .useValue(queueMock)
    .compile();

  app = moduleRef.createNestApplication();
  await app.init();
  chatService = app.get(ChatService);
  credits = app.get(CreditsService);
});

afterAll(async () => {
  await app?.close();
  for (const plantId of createdPlants) {
    const convs = await db
      .select({ id: chatConversation.id })
      .from(chatConversation)
      .where(eq(chatConversation.plantId, plantId));
    for (const c of convs) {
      await db.delete(chatMessage).where(eq(chatMessage.conversationId, c.id));
    }
    await db.delete(chatConversation).where(eq(chatConversation.plantId, plantId));
    await db.delete(plant).where(eq(plant.id, plantId));
  }
  for (const id of createdUsers) {
    await db.delete(usageRecord).where(eq(usageRecord.userId, id));
    await db.delete(creditTransaction).where(eq(creditTransaction.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  // NOTE: shared app_config keys are intentionally NOT deleted (see scans.e2e.spec.ts).
  await pool.end();
});

describe('POST /plants/:id/chat + GET /plants/:id/chat/messages (T-110, US6)', () => {
  it('Free tier: messages 1-10 are free (no credit touched), message 11 hits the paywall (402)', async () => {
    const userId = await makeUser(0); // Free tier, zero balance — the paywall must bite immediately at #11
    const plantPublicId = await makePlant(userId);
    nextChat = async () => ({ content: 'water weekly' });

    for (let i = 1; i <= 10; i += 1) {
      const res = await request(app.getHttpServer())
        .post(`/plants/${plantPublicId}/chat`)
        .set('Authorization', bearer(userId))
        .send({ content: `message #${i}` })
        .expect(202);
      expect(res.body.role).toBe('user');
      await chatService.processJob(lastJob as ChatJobData);
    }
    expect(await credits.getBalance(userId)).toBe(0); // never touched by the free messages

    await request(app.getHttpServer())
      .post(`/plants/${plantPublicId}/chat`)
      .set('Authorization', bearer(userId))
      .set('Idempotency-Key', nextIdemKey())
      .send({ content: 'message #11' })
      .expect(402);

    const history = await request(app.getHttpServer())
      .get(`/plants/${plantPublicId}/chat/messages`)
      .set('Authorization', bearer(userId))
      .expect(200);
    // 10 user + 10 assistant replies persisted; the failed 11th never got that far.
    expect(history.body.data.length).toBe(20);
  });

  it('Free tier past the cap: message 11 is metered and debits/settles credit', async () => {
    const userId = await makeUser(5);
    const plantPublicId = await makePlant(userId);
    nextChat = async () => ({ content: 'looks healthy' });

    for (let i = 1; i <= 10; i += 1) {
      await request(app.getHttpServer())
        .post(`/plants/${plantPublicId}/chat`)
        .set('Authorization', bearer(userId))
        .send({ content: `message #${i}` })
        .expect(202);
      await chatService.processJob(lastJob as ChatJobData);
    }

    const submit = await request(app.getHttpServer())
      .post(`/plants/${plantPublicId}/chat`)
      .set('Authorization', bearer(userId))
      .set('Idempotency-Key', nextIdemKey())
      .send({ content: 'message #11 — metered' })
      .expect(202);
    expect(submit.body.role).toBe('user');
    expect(await credits.getBalance(userId)).toBe(4); // debited on send, before the AI call

    await chatService.processJob(lastJob as ChatJobData);
    expect(await credits.getBalance(userId)).toBe(4); // completed, not refunded
  });

  it('AI failure on a metered message: credit is refunded (balance unchanged) [FR-017]', async () => {
    const userId = await makeUser(5);
    const plantPublicId = await makePlant(userId);
    nextChat = async () => ({ content: 'ok' });

    for (let i = 1; i <= 10; i += 1) {
      await request(app.getHttpServer())
        .post(`/plants/${plantPublicId}/chat`)
        .set('Authorization', bearer(userId))
        .send({ content: `message #${i}` })
        .expect(202);
      await chatService.processJob(lastJob as ChatJobData);
    }
    const before = await credits.getBalance(userId);

    nextChat = async () => {
      throw new Error('provider down');
    };
    await request(app.getHttpServer())
      .post(`/plants/${plantPublicId}/chat`)
      .set('Authorization', bearer(userId))
      .set('Idempotency-Key', nextIdemKey())
      .send({ content: 'message #11 — will fail' })
      .expect(202);
    expect(await credits.getBalance(userId)).toBe(before - 1); // debited on send

    await chatService.processJob(lastJob as ChatJobData);
    expect(await credits.getBalance(userId)).toBe(before); // debited then refunded
  });

  it('cross-user plant access: 404, never leaks another user’s conversation', async () => {
    const owner = await makeUser(0);
    const stranger = await makeUser(0);
    const plantPublicId = await makePlant(owner);

    await request(app.getHttpServer())
      .post(`/plants/${plantPublicId}/chat`)
      .set('Authorization', bearer(stranger))
      .send({ content: 'not yours' })
      .expect(404);

    await request(app.getHttpServer())
      .get(`/plants/${plantPublicId}/chat/messages`)
      .set('Authorization', bearer(stranger))
      .expect(404);
  });

  it('more than 2 context photo ids is rejected with 400', async () => {
    const userId = await makeUser(0);
    const plantPublicId = await makePlant(userId);

    await request(app.getHttpServer())
      .post(`/plants/${plantPublicId}/chat`)
      .set('Authorization', bearer(userId))
      .send({
        content: 'hi',
        contextPhotoIds: [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
        ],
      })
      .expect(400);
  });
});
