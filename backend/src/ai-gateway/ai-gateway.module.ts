import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { AiGatewayService } from './ai-gateway.service';
import { PLANT_AI_PROVIDER } from './plant-ai-provider.interface';
import { StubPlantAIProvider } from './stub-plant-ai.provider';
import { OpenAiLangchainProvider } from './openai-langchain.adapter';

/**
 * Binds PLANT_AI_PROVIDER to the real OpenAI adapter when OPENAI_API_KEY is set,
 * otherwise the deterministic stub — a config flip, no business-code change.
 */
@Module({
  imports: [CreditsModule],
  providers: [
    StubPlantAIProvider,
    OpenAiLangchainProvider,
    {
      provide: PLANT_AI_PROVIDER,
      useFactory: (stub: StubPlantAIProvider, openai: OpenAiLangchainProvider) =>
        process.env.OPENAI_API_KEY ? openai : stub,
      inject: [StubPlantAIProvider, OpenAiLangchainProvider],
    },
    AiGatewayService,
  ],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
