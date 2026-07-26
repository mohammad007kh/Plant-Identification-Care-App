import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type IORedis from 'ioredis';
import { createRedisConnection } from '../../jobs/queues';

/**
 * Redis-backed refresh-token store. Implemented as an ALLOWLIST keyed by the
 * token's `jti` (a valid refresh token is one whose jti is present); this is
 * strictly stronger than a denylist — rotation and logout both remove the jti,
 * so a revoked/rotated token can never be replayed, and the set self-expires
 * (no unbounded denylist growth). Only the jti is stored, never the raw token.
 */
@Injectable()
export class RefreshTokenRepository implements OnModuleDestroy {
  private redis?: IORedis;

  private conn(): IORedis {
    if (!this.redis) this.redis = createRedisConnection();
    return this.redis;
  }

  private key(jti: string): string {
    return `refresh:${jti}`;
  }

  /** Record a freshly issued refresh token as valid, expiring with the token. */
  async allow(jti: string, publicId: string, ttlSeconds: number): Promise<void> {
    await this.conn().set(this.key(jti), publicId, 'EX', ttlSeconds);
  }

  /**
   * Atomically consume (rotate): returns the stored public_id iff the jti is
   * present, deleting it in the same operation. Returns null when already
   * used/rotated/revoked — this is what makes refresh single-use and closes the
   * stolen-old-token race (GETDEL is atomic in Redis).
   */
  async consume(jti: string): Promise<string | null> {
    return this.conn().getdel(this.key(jti));
  }

  /** Revoke a refresh token (logout) so it can never be replayed. */
  async revoke(jti: string): Promise<void> {
    await this.conn().del(this.key(jti));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }
}
