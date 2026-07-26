import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { chatConversation, chatMessage, photo, plant, subscriptionTier, users } from '../db/schema';

export interface OwnedPlantRow {
  id: string;
}

export interface ConversationRow {
  id: string;
}

export interface ChatMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  contextPhotoIds: string[] | null;
  createdAt: Date;
}

export interface InsertMessageParams {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  contextPhotoIds: string[] | null;
  usageRecordId: string | null;
}

export interface MessagesPage {
  rows: ChatMessageRow[];
  nextCursor: string | null;
}

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: Pick<ChatMessageRow, 'createdAt' | 'id'>): string {
  const payload: Cursor = { createdAt: row.createdAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    if (Number.isNaN(new Date(parsed.createdAt).getTime())) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

const messageColumns = {
  id: chatMessage.id,
  role: chatMessage.role,
  content: chatMessage.content,
  contextPhotoIds: chatMessage.contextPhotoIds,
  createdAt: chatMessage.createdAt,
};

/**
 * All Drizzle access for `chat_conversation`/`chat_message` plus the tenancy
 * (`plant` ownership) and tier (`users` → `subscription_tier`) lookups the chat
 * module needs (repository pattern — no naked ORM queries in the service, per
 * `code_patterns.data_access`). Every plant/conversation lookup is scoped by
 * `userId` (registry `database.tenancy_model: single_tenant`) — there is
 * intentionally no "find by id alone" method (Station 07 tenancy rule).
 */
@Injectable()
export class ChatRepository {
  /** Resolves `public_id` → row, scoped by `userId`. Returns null if absent OR not owned. */
  async findOwnedPlant(userId: string, plantPublicId: string): Promise<OwnedPlantRow | null> {
    const [row] = await db
      .select({ id: plant.id })
      .from(plant)
      .where(and(eq(plant.publicId, plantPublicId), eq(plant.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  /**
   * Resolves the requested context photo public ids to their storage keys, but
   * ONLY among photos that belong to `plantId` — a photo id for another plant
   * (even one the same user owns) is silently excluded, so the caller can
   * detect a mismatch by comparing the returned map's size to the request.
   */
  async findOwnedPhotoStorageKeys(
    plantId: string,
    publicIds: string[],
  ): Promise<Map<string, string>> {
    if (publicIds.length === 0) return new Map();
    const rows = await db
      .select({ publicId: photo.publicId, storageKey: photo.storageKey })
      .from(photo)
      .where(and(eq(photo.plantId, plantId), inArray(photo.publicId, publicIds)));
    return new Map(rows.map((r) => [r.publicId, r.storageKey]));
  }

  /** The caller's subscription tier key; defaults to `free` when unassigned (no billing yet). */
  async getUserTierKey(userId: string): Promise<'free' | 'pro' | 'max'> {
    const [row] = await db
      .select({ tierKey: subscriptionTier.key })
      .from(users)
      .leftJoin(subscriptionTier, eq(users.subscriptionTierId, subscriptionTier.id))
      .where(eq(users.id, userId))
      .limit(1);
    return row?.tierKey ?? 'free';
  }

  /** One conversation per (user, plant) — created lazily on the first message. */
  async findOrCreateConversation(userId: string, plantId: string): Promise<ConversationRow> {
    const [existing] = await db
      .select({ id: chatConversation.id })
      .from(chatConversation)
      .where(and(eq(chatConversation.userId, userId), eq(chatConversation.plantId, plantId)))
      .limit(1);
    if (existing) return existing;

    const [created] = await db
      .insert(chatConversation)
      .values({ userId, plantId })
      .returning({ id: chatConversation.id });
    return created;
  }

  /** Count of `role=user` messages already in the conversation (the Free-tier cap boundary). */
  async countUserMessages(conversationId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessage)
      .where(and(eq(chatMessage.conversationId, conversationId), eq(chatMessage.role, 'user')));
    return row?.count ?? 0;
  }

  async insertMessage(params: InsertMessageParams): Promise<ChatMessageRow> {
    const [row] = await db
      .insert(chatMessage)
      .values({
        conversationId: params.conversationId,
        role: params.role,
        content: params.content,
        contextPhotoIds: params.contextPhotoIds,
        usageRecordId: params.usageRecordId,
      })
      .returning(messageColumns);
    return row;
  }

  /**
   * Cursor-paginated message history for a plant, scoped by `userId`. Returns
   * null when the plant does not exist or is not owned by `userId` (→ 404).
   * A plant with no conversation yet (never chatted) returns an empty page
   * rather than null — it is owned, just empty.
   */
  async listMessages(
    userId: string,
    plantPublicId: string,
    cursor: string | null,
    limit: number,
  ): Promise<MessagesPage | null> {
    const ownedPlant = await this.findOwnedPlant(userId, plantPublicId);
    if (!ownedPlant) return null;

    const [conversation] = await db
      .select({ id: chatConversation.id })
      .from(chatConversation)
      .where(and(eq(chatConversation.userId, userId), eq(chatConversation.plantId, ownedPlant.id)))
      .limit(1);
    if (!conversation) return { rows: [], nextCursor: null };

    const decoded = cursor ? decodeCursor(cursor) : null;
    if (cursor && !decoded) {
      throw new BadRequestException({ code: 'invalid_cursor', message: 'cursor is malformed' });
    }

    const conditions = [eq(chatMessage.conversationId, conversation.id)];
    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      const beforeCursor = or(
        lt(chatMessage.createdAt, cursorDate),
        and(eq(chatMessage.createdAt, cursorDate), lt(chatMessage.id, decoded.id)),
      );
      if (beforeCursor) conditions.push(beforeCursor);
    }

    const rows = await db
      .select(messageColumns)
      .from(chatMessage)
      .where(and(...conditions))
      .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;
    return { rows: page, nextCursor };
  }
}
