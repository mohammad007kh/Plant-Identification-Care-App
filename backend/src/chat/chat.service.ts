import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ChatMessage } from 'shared';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AppConfigService } from '../common/config/app-config.service';
import { StorageService } from '../common/uploads/storage.service';
import { CreditsService } from '../credits/credits.service';
import { ChatQueue, type ChatJobData } from './chat.queue';
import { ChatRepository, type ChatMessageRow } from './chat.repository';

export type { ChatJobData } from './chat.queue';

/** Free-tier messages per conversation before the credit paywall applies (FR-013). */
const FREE_MESSAGE_LIMIT = 10;

const FAILURE_MESSAGE =
  'پاسخ دستیار با خطا مواجه شد. اعتبار شما (در صورت کسر) بازگردانده شد؛ لطفاً دوباره تلاش کنید.';

export interface SendMessageParams {
  userId: string;
  plantPublicId: string;
  content: string;
  /** Public photo ids (≤2), validated against the plant's own photo history. */
  contextPhotoIds: string[];
  /** Required only when this message is metered (Pro/Max, or Free past the cap). */
  idempotencyKey?: string;
}

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * Plant-scoped AI chat (US6, FR-012/FR-013). `sendMessage` enforces the
 * Free-tier 10-message-per-conversation cap BEFORE any credit is touched, then
 * (for a metered message) reserves credit and enqueues the async reply job;
 * `processJob` (invoked by ChatWorker, or directly in tests) makes the AI call
 * and settles/refunds the reservation exactly once — mirrors the
 * ScansService/IdentifyService reserve-then-settle split (registry
 * `architecture.communication: async`).
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly repo: ChatRepository,
    private readonly ai: AiGatewayService,
    private readonly credits: CreditsService,
    private readonly config: AppConfigService,
    private readonly storage: StorageService,
    private readonly queue: ChatQueue,
  ) {}

  async sendMessage(params: SendMessageParams): Promise<ChatMessage> {
    const { userId, plantPublicId, content, contextPhotoIds, idempotencyKey } = params;

    // Defense-in-depth: the contract already caps `contextPhotoIds` at 2
    // (400 at the controller), but the service enforces it independently so a
    // direct caller (or a future non-HTTP entry point) cannot bypass it.
    if (contextPhotoIds.length > 2) {
      throw new BadRequestException({
        code: 'too_many_context_photos',
        message: 'at most 2 context photos are allowed',
      });
    }

    const ownedPlant = await this.repo.findOwnedPlant(userId, plantPublicId);
    if (!ownedPlant) throw new NotFoundException('plant not found');

    const photoKeys = await this.repo.findOwnedPhotoStorageKeys(ownedPlant.id, contextPhotoIds);
    if (photoKeys.size !== contextPhotoIds.length) {
      throw new BadRequestException({
        code: 'invalid_context_photo',
        message: 'context photos must belong to this plant',
      });
    }

    const conversation = await this.repo.findOrCreateConversation(userId, ownedPlant.id);

    // Free-tier cap check happens BEFORE any debit (gate criteria): count the
    // conversation's prior user messages first, independent of credit state.
    const priorUserMessages = await this.repo.countUserMessages(conversation.id);
    const tier = await this.repo.getUserTierKey(userId);
    const isFreeMessage = tier === 'free' && priorUserMessages < FREE_MESSAGE_LIMIT;

    let usageRecordId: string | null = null;
    if (!isFreeMessage) {
      // Metered path (Pro/Max every message; Free past the cap) is charge-bearing,
      // so — like scans — it MUST be replay-safe: require a client Idempotency-Key.
      if (!idempotencyKey) {
        throw new BadRequestException({
          code: 'idempotency_key_required',
          message: 'Idempotency-Key header is required for metered chat messages',
        });
      }
      const costs = await this.config.getCreditCosts();
      const reserved = await this.credits.reserve({
        userId,
        action: 'chat',
        cost: costs.chat,
        idempotencyKey,
      });
      usageRecordId = reserved.usageRecordId;
    }

    const userMessage = await this.repo.insertMessage({
      conversationId: conversation.id,
      role: 'user',
      content,
      contextPhotoIds: contextPhotoIds.length > 0 ? contextPhotoIds : null,
      usageRecordId: null,
    });

    try {
      await this.queue.enqueueChat({
        conversationId: conversation.id,
        usageRecordId,
        content,
        storageKeys: contextPhotoIds.map((id) => photoKeys.get(id) as string),
      });
    } catch (err) {
      // Handoff to the worker failed (e.g. Redis down): release any reserved
      // credit now rather than leaving it stranded (mirrors ScansService).
      if (usageRecordId) {
        try {
          await this.credits.refundUsage(usageRecordId);
        } catch (refundErr) {
          this.logger.error(
            `refund after chat enqueue failure did not complete: ${(refundErr as Error).message}`,
          );
        }
      }
      throw err;
    }

    return this.toDto(userMessage);
  }

  /**
   * Business logic of the async chat-reply job — kept separate from the BullMQ
   * wiring (ChatWorker) so it can be invoked directly in tests without a live
   * queue (mirrors IdentifyService.process). On any AI error the reserved
   * credit (if any) is refunded exactly once and a failure message is
   * persisted; the error is NOT rethrown (a BullMQ retry would re-run an
   * already-refunded job).
   */
  async processJob(data: ChatJobData): Promise<void> {
    const { conversationId, usageRecordId, content, storageKeys } = data;
    try {
      const photos = await Promise.all(storageKeys.map((key) => this.storage.getBytes(key)));
      const result = await this.ai.chat(content, photos);

      await this.repo.insertMessage({
        conversationId,
        role: 'assistant',
        content: result.content,
        contextPhotoIds: null,
        usageRecordId,
      });
      if (usageRecordId) await this.credits.complete(usageRecordId);
    } catch (err) {
      this.logger.error(
        `chat job for conversation ${conversationId} failed: ${(err as Error).message}`,
      );
      try {
        await this.repo.insertMessage({
          conversationId,
          role: 'assistant',
          content: FAILURE_MESSAGE,
          contextPhotoIds: null,
          usageRecordId: null,
        });
      } catch (persistErr) {
        this.logger.error(
          `persisting chat failure message failed: ${(persistErr as Error).message}`,
        );
      }
      if (usageRecordId) {
        try {
          await this.credits.refundUsage(usageRecordId);
        } catch (refundErr) {
          this.logger.error(
            `refund for chat usage record ${usageRecordId} failed: ${(refundErr as Error).message}`,
          );
        }
      }
    }
  }

  async listMessages(
    userId: string,
    plantPublicId: string,
    cursor: string | null,
    limit: number,
  ): Promise<CursorPage<ChatMessage>> {
    const page = await this.repo.listMessages(userId, plantPublicId, cursor, limit);
    if (!page) throw new NotFoundException('plant not found');
    return { data: page.rows.map((row) => this.toDto(row)), nextCursor: page.nextCursor };
  }

  private toDto(row: ChatMessageRow): ChatMessage {
    return {
      // NOTE: `chat_message.id` is an internal ULID, not a public UUID — T-012's
      // schema did not give this table a separate `public_id` column (unlike
      // `chat_conversation`). Exposed as-is; `chatMessageSchema.id` is typed
      // `string` at the TS level (the `.uuid()` zod refinement is not enforced
      // on outgoing responses anywhere in this codebase, only on request bodies).
      id: row.id,
      role: row.role,
      content: row.content,
      contextPhotoIds: row.contextPhotoIds ?? [],
      createdAt: row.createdAt.toISOString(),
    };
  }
}
