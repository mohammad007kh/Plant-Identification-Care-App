import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { users } from '../../db/schema';

export interface UserRecord {
  id: string;
  publicId: string;
  email: string;
  role: 'user' | 'admin';
  passwordHash: string;
}

export type PublicUser = Omit<UserRecord, 'passwordHash'>;

export interface NotificationPreferencesRow {
  notifEmailEnabled: boolean;
  notifPushEnabled: boolean;
}

/** Drizzle access for the `users` table (shared by auth and later user features). */
@Injectable()
export class UsersRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    const [row] = await db
      .select({
        id: users.id,
        publicId: users.publicId,
        email: users.email,
        role: users.role,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ?? null;
  }

  async findByPublicId(publicId: string): Promise<PublicUser | null> {
    const [row] = await db
      .select({
        id: users.id,
        publicId: users.publicId,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.publicId, publicId))
      .limit(1);
    return row ?? null;
  }

  async create(email: string, passwordHash: string): Promise<PublicUser> {
    const [row] = await db.insert(users).values({ email, passwordHash }).returning({
      id: users.id,
      publicId: users.publicId,
      email: users.email,
      role: users.role,
    });
    return row;
  }

  /** Care-reminder channel toggles (US7, FR-020/FR-022). Null if the user no longer exists. */
  async getNotificationPreferences(userId: string): Promise<NotificationPreferencesRow | null> {
    const [row] = await db
      .select({
        notifEmailEnabled: users.notifEmailEnabled,
        notifPushEnabled: users.notifPushEnabled,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  /** Partial update — only the provided toggle(s) change (FR-022: takes effect immediately). */
  async updateNotificationPreferences(
    userId: string,
    patch: Partial<NotificationPreferencesRow>,
  ): Promise<void> {
    await db.update(users).set(patch).where(eq(users.id, userId));
  }
}
