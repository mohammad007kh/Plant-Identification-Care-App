import { Module } from '@nestjs/common';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { AppConfigModule } from '../common/config/app-config.module';
import { UploadsModule } from '../common/uploads/uploads.module';
import { CreditsModule } from '../credits/credits.module';
import { AuthModule } from '../modules/auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatQueue } from './chat.queue';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';
import { ChatWorker } from './chat.worker';

/**
 * US6 plant chat feature module (T-110): metered send + async AI reply worker
 * + cursor-paginated history. Imports AuthModule for JwtAuthGuard/CurrentUserId
 * (every route is user-scoped), CreditsModule/AiGatewayModule for the metered
 * AI call, and UploadsModule for StorageService (context photo bytes). NOT
 * imported by app.module here — T-117 registers it alongside the rest of the
 * chat surface (T-111 frontend).
 */
@Module({
  imports: [AuthModule, AppConfigModule, CreditsModule, AiGatewayModule, UploadsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatQueue, ChatWorker],
  exports: [ChatService, ChatRepository],
})
export class ChatModule {}
