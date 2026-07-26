import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsRepository } from './analytics.repository';

describe('AnalyticsService.track (T-160, FR-028)', () => {
  let repo: { insertEvent: ReturnType<typeof vi.fn> };
  let service: AnalyticsService;

  beforeEach(() => {
    repo = { insertEvent: vi.fn().mockResolvedValue(undefined) };
    service = new AnalyticsService(repo as unknown as AnalyticsRepository);
  });

  it('persists the event with the userId extracted into its own field and the rest as props', async () => {
    await service.track('scan.succeeded', { userId: 'u1', confidence: 0.92, lowConfidence: false });

    expect(repo.insertEvent).toHaveBeenCalledWith({
      userId: 'u1',
      name: 'scan.succeeded',
      props: { confidence: 0.92, lowConfidence: false },
    });
  });

  it('defaults userId to null for guest-attributed events', async () => {
    await service.track('scan.attempted', { source: 'guest' });

    expect(repo.insertEvent).toHaveBeenCalledWith({
      userId: null,
      name: 'scan.attempted',
      props: { source: 'guest' },
    });
  });

  it('is callable with no props at all', async () => {
    await service.track('registration.converted');

    expect(repo.insertEvent).toHaveBeenCalledWith({
      userId: null,
      name: 'registration.converted',
      props: {},
    });
  });

  describe('non-blocking guarantee', () => {
    it('never throws when the repository write fails', async () => {
      repo.insertEvent.mockRejectedValueOnce(new Error('db unavailable'));

      await expect(
        service.track('credit.consumed', { userId: 'u1', amount: 2 }),
      ).resolves.toBeUndefined();
    });

    it('never throws when the repository write hangs and rejects later', async () => {
      repo.insertEvent.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.track('chat.message_sent', { userId: 'u1' })).resolves.toBeUndefined();
      expect(repo.insertEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe('payload minimization (no PII)', () => {
    it('drops the event instead of persisting an obviously-PII prop key', async () => {
      await service.track('registration.converted', {
        userId: 'u1',
        email: 'someone@example.com',
      } as never);

      expect(repo.insertEvent).not.toHaveBeenCalled();
    });

    it('drops the event when a photo-shaped key is present', async () => {
      await service.track('scan.attempted', { userId: 'u1', photo: 'base64...' } as never);

      expect(repo.insertEvent).not.toHaveBeenCalled();
    });

    it('is case-insensitive when matching PII-shaped keys', async () => {
      await service.track('registration.converted', { userId: 'u1', Email: 'x@y.com' } as never);

      expect(repo.insertEvent).not.toHaveBeenCalled();
    });

    it('still persists clean scalar props alongside a PII-free payload', async () => {
      await service.track('subscription.tier_changed', {
        userId: 'u1',
        fromTier: 'free',
        toTier: 'pro',
      });

      expect(repo.insertEvent).toHaveBeenCalledWith({
        userId: 'u1',
        name: 'subscription.tier_changed',
        props: { fromTier: 'free', toTier: 'pro' },
      });
    });
  });
});
