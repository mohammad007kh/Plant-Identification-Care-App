import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type IORedis from 'ioredis';
import { createRedisConnection } from '../../jobs/queues';

/** Max NEW guest sessions one IP may create per day (cookie-clearing abuse cap). */
const dailyCap = (): number => Number(process.env.GUEST_IP_DAILY_CAP ?? 50);

/**
 * Redis-backed per-IP daily counter. Because guests are unauthenticated, a single
 * IP clearing its cookie could otherwise mint unlimited guest sessions and burn
 * the shared free-tier AI budget. Keyed by `ip_hash` + date with a 24h TTL.
 */
@Injectable()
export class IpScanBackstopService implements OnModuleDestroy {
  private redis?: IORedis;

  private conn(): IORedis {
    if (!this.redis) this.redis = createRedisConnection();
    return this.redis;
  }

  /** Records one new-session attempt for this ip hash; false when over the daily cap. */
  async tryConsume(ipHash: string): Promise<boolean> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `guest-ip:${day}:${ipHash}`;
    const redis = this.conn();
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, 24 * 60 * 60);
    return count <= dailyCap();
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
