import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreditsService, type MeteredActionParams } from '../credits/credits.service';
import {
  PLANT_AI_PROVIDER,
  type CompareResult,
  type ChatResult,
  type PlantAIProvider,
} from './plant-ai-provider.interface';

const CONFIDENCE_THRESHOLD = Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.7);
const MAX_ATTEMPTS = Number(process.env.AI_MAX_ATTEMPTS ?? 2);

export interface GatedIdentifyResult {
  confidence: number;
  speciesId: string | null;
  careGuide: Record<string, unknown> | null;
  /** True when confidence < threshold: the species is withheld (FR-003). */
  lowConfidence: boolean;
}

/**
 * The one place business code touches the AI model. Owns the 70% confidence
 * gate, timeout/retry-with-backoff, and structured logging; delegates credit
 * metering to CreditsService.runMeteredAction (the only sanctioned paid-call path).
 */
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);

  constructor(
    @Inject(PLANT_AI_PROVIDER) private readonly provider: PlantAIProvider,
    private readonly credits: CreditsService,
  ) {}

  /** Identify with the confidence gate applied: below threshold → species withheld. */
  async identify(photo: Buffer): Promise<GatedIdentifyResult> {
    const result = await this.withRetry(() => this.provider.identify(photo));
    if (result.confidence < CONFIDENCE_THRESHOLD) {
      return {
        confidence: result.confidence,
        speciesId: null,
        careGuide: null,
        lowConfidence: true,
      };
    }
    return {
      confidence: result.confidence,
      speciesId: result.speciesId,
      careGuide: result.careGuide,
      lowConfidence: false,
    };
  }

  compareHealth(previous: Buffer, latest: Buffer): Promise<CompareResult> {
    return this.withRetry(() => this.provider.compareHealth(previous, latest));
  }

  chat(message: string, contextPhotos: Buffer[]): Promise<ChatResult> {
    return this.withRetry(() => this.provider.chat(message, contextPhotos));
  }

  /** Sanctioned entry point for any credit-metered AI action (debit → work → refund-on-fail). */
  runMeteredAction<T>(params: MeteredActionParams<T>): Promise<T> {
    return this.credits.runMeteredAction<T>(params);
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `AI call failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error).message}`,
        );
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 2 ** (attempt - 1) * 200));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('AI provider failed');
  }
}
