import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import type { ChatRepository } from './chat.repository';
import type { ChatQueue } from './chat.queue';
import type { CreditsService } from '../credits/credits.service';
import type { AppConfigService } from '../common/config/app-config.service';
import type { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import type { StorageService } from '../common/uploads/storage.service';
import { InsufficientCreditException } from '../credits/insufficient-credit.exception';

describe('ChatService.sendMessage (T-110, FR-012/FR-013/FR-015)', () => {
  let repo: {
    findOwnedPlant: ReturnType<typeof vi.fn>;
    findOwnedPhotoStorageKeys: ReturnType<typeof vi.fn>;
    findOrCreateConversation: ReturnType<typeof vi.fn>;
    countUserMessages: ReturnType<typeof vi.fn>;
    getUserTierKey: ReturnType<typeof vi.fn>;
    insertMessage: ReturnType<typeof vi.fn>;
  };
  let credits: { reserve: ReturnType<typeof vi.fn>; refundUsage: ReturnType<typeof vi.fn> };
  let config: { getCreditCosts: ReturnType<typeof vi.fn> };
  let queue: { enqueueChat: ReturnType<typeof vi.fn> };
  let ai: { chat: ReturnType<typeof vi.fn> };
  let storage: { getBytes: ReturnType<typeof vi.fn> };
  let service: ChatService;

  const insertedMessage = {
    id: 'msg1',
    role: 'user' as const,
    content: 'hello',
    contextPhotoIds: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    repo = {
      findOwnedPlant: vi.fn().mockResolvedValue({ id: 'plant-internal-1' }),
      findOwnedPhotoStorageKeys: vi.fn().mockResolvedValue(new Map()),
      findOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      countUserMessages: vi.fn().mockResolvedValue(0),
      getUserTierKey: vi.fn().mockResolvedValue('free'),
      insertMessage: vi.fn().mockResolvedValue(insertedMessage),
    };
    credits = {
      reserve: vi.fn().mockResolvedValue({ usageRecordId: 'ur1' }),
      refundUsage: vi.fn().mockResolvedValue(undefined),
    };
    config = { getCreditCosts: vi.fn().mockResolvedValue({ identify: 1, chat: 1, comparison: 1 }) };
    queue = { enqueueChat: vi.fn().mockResolvedValue(undefined) };
    ai = { chat: vi.fn() };
    storage = { getBytes: vi.fn() };

    service = new ChatService(
      repo as unknown as ChatRepository,
      ai as unknown as AiGatewayService,
      credits as unknown as CreditsService,
      config as unknown as AppConfigService,
      storage as unknown as StorageService,
      queue as unknown as ChatQueue,
    );
  });

  it('cross-user / unowned plant: 404, nothing else touched', async () => {
    repo.findOwnedPlant.mockResolvedValueOnce(null);

    await expect(
      service.sendMessage({
        userId: 'u1',
        plantPublicId: 'p1',
        content: 'hi',
        contextPhotoIds: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repo.findOrCreateConversation).not.toHaveBeenCalled();
    expect(credits.reserve).not.toHaveBeenCalled();
    expect(queue.enqueueChat).not.toHaveBeenCalled();
  });

  it('more than 2 context photos is rejected before any DB/credit work', async () => {
    await expect(
      service.sendMessage({
        userId: 'u1',
        plantPublicId: 'p1',
        content: 'hi',
        contextPhotoIds: ['a', 'b', 'c'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repo.findOwnedPlant).not.toHaveBeenCalled();
    expect(credits.reserve).not.toHaveBeenCalled();
  });

  it('a context photo not belonging to the plant is rejected', async () => {
    repo.findOwnedPhotoStorageKeys.mockResolvedValueOnce(new Map([['a', 'key-a']])); // only 1 of 2 resolved

    await expect(
      service.sendMessage({
        userId: 'u1',
        plantPublicId: 'p1',
        content: 'hi',
        contextPhotoIds: ['a', 'b'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repo.findOrCreateConversation).not.toHaveBeenCalled();
  });

  it('Free tier, message #10 (9 prior): free — no Idempotency-Key needed, no debit', async () => {
    repo.countUserMessages.mockResolvedValueOnce(9);

    await service.sendMessage({
      userId: 'u1',
      plantPublicId: 'p1',
      content: 'hi',
      contextPhotoIds: [],
    });

    expect(credits.reserve).not.toHaveBeenCalled();
    expect(repo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'user', usageRecordId: null }),
    );
    expect(queue.enqueueChat).toHaveBeenCalledWith(
      expect.objectContaining({ usageRecordId: null }),
    );
  });

  it('Free tier, message #11 (10 prior): paywall — insufficient credit surfaces as 402', async () => {
    repo.countUserMessages.mockResolvedValueOnce(10);
    credits.reserve.mockRejectedValueOnce(new InsufficientCreditException());

    await expect(
      service.sendMessage({
        userId: 'u1',
        plantPublicId: 'p1',
        content: 'hi',
        contextPhotoIds: [],
        idempotencyKey: 'k-11',
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditException);

    expect(credits.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', action: 'chat', cost: 1, idempotencyKey: 'k-11' }),
    );
    expect(repo.insertMessage).not.toHaveBeenCalled();
    expect(queue.enqueueChat).not.toHaveBeenCalled();
  });

  it('Free tier, message #11 without an Idempotency-Key: 400, no reserve attempted', async () => {
    repo.countUserMessages.mockResolvedValueOnce(10);

    await expect(
      service.sendMessage({
        userId: 'u1',
        plantPublicId: 'p1',
        content: 'hi',
        contextPhotoIds: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(credits.reserve).not.toHaveBeenCalled();
  });

  it('Pro tier: message #1 is metered from the start (no free cap)', async () => {
    repo.countUserMessages.mockResolvedValueOnce(0);
    repo.getUserTierKey.mockResolvedValueOnce('pro');

    await service.sendMessage({
      userId: 'u1',
      plantPublicId: 'p1',
      content: 'hi',
      contextPhotoIds: [],
      idempotencyKey: 'k-pro-1',
    });

    expect(credits.reserve).toHaveBeenCalledTimes(1);
    expect(queue.enqueueChat).toHaveBeenCalledWith(
      expect.objectContaining({ usageRecordId: 'ur1' }),
    );
  });

  it('enqueue failure: refunds the reserved credit and rejects', async () => {
    repo.countUserMessages.mockResolvedValueOnce(10); // metered path
    queue.enqueueChat.mockRejectedValueOnce(new Error('redis down'));

    await expect(
      service.sendMessage({
        userId: 'u1',
        plantPublicId: 'p1',
        content: 'hi',
        contextPhotoIds: [],
        idempotencyKey: 'k-enq-fail',
      }),
    ).rejects.toThrow('redis down');

    expect(credits.refundUsage).toHaveBeenCalledWith('ur1');
  });
});

describe('ChatService.processJob (T-110, FR-017)', () => {
  const makeRepo = () => ({
    insertMessage: vi.fn().mockResolvedValue(undefined),
  });
  const storage = { getBytes: vi.fn().mockResolvedValue(Buffer.from('img')) };

  const build = (
    repo: ReturnType<typeof makeRepo>,
    ai: { chat: ReturnType<typeof vi.fn> },
    credits: { complete: ReturnType<typeof vi.fn>; refundUsage: ReturnType<typeof vi.fn> },
  ) =>
    new ChatService(
      repo as unknown as ChatRepository,
      ai as unknown as AiGatewayService,
      credits as unknown as CreditsService,
      {} as unknown as AppConfigService,
      storage as unknown as StorageService,
      {} as unknown as ChatQueue,
    );

  it('success: persists the assistant reply and completes the usage record', async () => {
    const repo = makeRepo();
    const ai = { chat: vi.fn().mockResolvedValue({ content: 'water it weekly' }) };
    const credits = { complete: vi.fn().mockResolvedValue(undefined), refundUsage: vi.fn() };

    await build(repo, ai, credits).processJob({
      conversationId: 'conv-1',
      usageRecordId: 'ur1',
      content: 'how often should I water?',
      storageKeys: [],
    });

    expect(repo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'assistant',
        content: 'water it weekly',
        usageRecordId: 'ur1',
      }),
    );
    expect(credits.complete).toHaveBeenCalledWith('ur1');
    expect(credits.refundUsage).not.toHaveBeenCalled();
  });

  it('Free-tier message (no usage record): success completes nothing on the ledger', async () => {
    const repo = makeRepo();
    const ai = { chat: vi.fn().mockResolvedValue({ content: 'ok' }) };
    const credits = { complete: vi.fn(), refundUsage: vi.fn() };

    await build(repo, ai, credits).processJob({
      conversationId: 'conv-1',
      usageRecordId: null,
      content: 'hi',
      storageKeys: [],
    });

    expect(credits.complete).not.toHaveBeenCalled();
    expect(credits.refundUsage).not.toHaveBeenCalled();
  });

  it('AI failure: refunds the reserved credit exactly once and persists a failure message (FR-017)', async () => {
    const repo = makeRepo();
    const ai = { chat: vi.fn().mockRejectedValue(new Error('provider down')) };
    const credits = { complete: vi.fn(), refundUsage: vi.fn().mockResolvedValue(undefined) };

    await build(repo, ai, credits).processJob({
      conversationId: 'conv-1',
      usageRecordId: 'ur1',
      content: 'how often should I water?',
      storageKeys: [],
    });

    expect(credits.refundUsage).toHaveBeenCalledWith('ur1');
    expect(credits.complete).not.toHaveBeenCalled();
    expect(repo.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'assistant', usageRecordId: null }),
    );
  });

  it('Free-tier AI failure: no refund attempted (no credit was reserved)', async () => {
    const repo = makeRepo();
    const ai = { chat: vi.fn().mockRejectedValue(new Error('provider down')) };
    const credits = { complete: vi.fn(), refundUsage: vi.fn() };

    await build(repo, ai, credits).processJob({
      conversationId: 'conv-1',
      usageRecordId: null,
      content: 'hi',
      storageKeys: [],
    });

    expect(credits.refundUsage).not.toHaveBeenCalled();
  });
});

describe('ChatService.listMessages (T-110, tenancy)', () => {
  it('plant not owned by the caller: 404', async () => {
    const repo = { listMessages: vi.fn().mockResolvedValue(null) };
    const service = new ChatService(
      repo as unknown as ChatRepository,
      {} as unknown as AiGatewayService,
      {} as unknown as CreditsService,
      {} as unknown as AppConfigService,
      {} as unknown as StorageService,
      {} as unknown as ChatQueue,
    );

    await expect(service.listMessages('u1', 'p1', null, 20)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
