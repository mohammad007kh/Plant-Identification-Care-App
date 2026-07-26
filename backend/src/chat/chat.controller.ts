import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ChatMessage } from 'shared';
import { chatMessageRequestSchema } from 'shared';
import { CurrentUserId } from '../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { ChatService, type CursorPage } from './chat.service';
import { listChatMessagesQuerySchema } from './dto/list-chat-messages-query.dto';

/**
 * `POST /v1/plants/:id/chat` (metered, 202 accepted — enqueues the async AI
 * reply job; 402 when out of credit) and `GET /v1/plants/:id/chat/messages`
 * (cursor-paginated history), US6/FR-012/FR-013. Every route is guarded by
 * JwtAuthGuard; `userId` always comes from the verified JWT principal
 * (`@CurrentUserId()`), never from the request body/query (Station 07 tenancy
 * rule). Not registered in app.module here — T-117 wires this module.
 */
@Controller('plants/:id/chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  send(
    @CurrentUserId() userId: string,
    @Param('id') plantId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ChatMessage> {
    const parsed = chatMessageRequestSchema.safeParse(body);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);

    return this.chat.sendMessage({
      userId,
      plantPublicId: plantId,
      content: parsed.data.content,
      contextPhotoIds: parsed.data.contextPhotoIds ?? [],
      idempotencyKey,
    });
  }

  @Get('messages')
  list(
    @CurrentUserId() userId: string,
    @Param('id') plantId: string,
    @Query() query: unknown,
  ): Promise<CursorPage<ChatMessage>> {
    const parsed = listChatMessagesQuerySchema.safeParse(query);
    if (!parsed.success) throw this.badRequest(parsed.error.issues);

    return this.chat.listMessages(userId, plantId, parsed.data.cursor ?? null, parsed.data.limit);
  }

  private badRequest(issues: { message: string }[]): BadRequestException {
    return new BadRequestException({
      code: 'validation_error',
      message: issues.map((i) => i.message).join('; '),
    });
  }
}
