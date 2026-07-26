import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import type { Request, Response } from 'express';
import { GuestSessionRepository } from './guest-session.repository';
import { IpScanBackstopService } from './ip-scan-backstop.service';
import {
  GuestIpDailyLimitException,
  GuestScanLimitExceededException,
} from './guest-scan-limit.exception';

export const GUEST_SCAN_LIMIT = 2;
const COOKIE_NAME = 'guest-id';
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const IP_SALT = process.env.GUEST_IP_HASH_SALT ?? 'plant-guest-salt';

/**
 * Server-authoritative guest identity + scan-limit enforcement (FR-006). The
 * client never self-reports its scan count: the server issues an httpOnly
 * `guest-id` cookie, keeps the count in `guest_session.scan_count`, and caps new
 * sessions per IP per day so cookie-clearing can't bypass the 2-scan limit.
 */
@Injectable()
export class GuestsService {
  constructor(
    private readonly repo: GuestSessionRepository,
    private readonly ipBackstop: IpScanBackstopService,
  ) {}

  /**
   * Resolves the guest session from the httpOnly cookie, or creates one (subject
   * to the per-IP daily backstop) and sets the cookie. Returns the session id.
   */
  async resolveOrCreateGuestSession(req: Request, res: Response): Promise<string> {
    const existingId = this.readCookie(req, COOKIE_NAME);
    if (existingId) {
      const session = await this.repo.findById(existingId);
      if (session) return session.id;
    }

    const ipHash = this.hashIp(this.clientIp(req));
    const withinCap = await this.ipBackstop.tryConsume(ipHash);
    if (!withinCap) throw new GuestIpDailyLimitException();

    const id = ulid();
    await this.repo.create(id, ipHash);
    this.setCookie(res, COOKIE_NAME, id);
    return id;
  }

  /** Cheap pre-check for a clean 403 when the guest is already at the cap. */
  async assertScanAllowed(guestSessionId: string): Promise<void> {
    const session = await this.repo.findById(guestSessionId);
    if (!session || session.scanCount >= GUEST_SCAN_LIMIT) {
      throw new GuestScanLimitExceededException();
    }
  }

  /**
   * Atomically reserve a scan slot. This is the definitive, race-safe gate:
   * concurrent requests serialize on the row lock, so only 2 can ever succeed.
   * Reserving BEFORE the scan is created guarantees the limit even under a race
   * (a failed scan afterwards costs the guest a slot — acceptable for a free tier).
   */
  async reserveScan(guestSessionId: string): Promise<void> {
    const newCount = await this.repo.incrementIfBelow(guestSessionId, GUEST_SCAN_LIMIT);
    if (newCount === null) throw new GuestScanLimitExceededException();
  }

  private readCookie(req: Request, name: string): string | null {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === name) return decodeURIComponent(v.join('='));
    }
    return null;
  }

  private setCookie(res: Response, name: string, value: string): void {
    res.cookie(name, value, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: COOKIE_MAX_AGE_MS,
      path: '/',
    });
  }

  private clientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }

  private hashIp(ip: string): string {
    return createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex');
  }
}
