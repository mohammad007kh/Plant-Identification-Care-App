import { Inject, Injectable } from '@nestjs/common';
import { CreditsService, type MeteredActionParams } from '../credits/credits.service';
import { ErrorCode } from '../common/errors/error-codes';
import { CircuitBreaker, callOutboundService } from '../common/http/outbound';
import {
  PLANT_AI_PROVIDER,
  type CompareResult,
  type ChatResult,
  type PlantAIProvider,
} from './plant-ai-provider.interface';

const CONFIDENCE_THRESHOLD = Number(process.env.AI_CONFIDENCE_THRESHOLD ?? 0.7);
const MAX_ATTEMPTS = Number(process.env.AI_MAX_ATTEMPTS ?? 2);
/** Wall-clock budget for a SINGLE AI provider call (identify/compare/chat). */
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 20_000);
/** Consecutive AI-call failures before the breaker fails fast (FR-030). */
const CIRCUIT_FAILURE_THRESHOLD = Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD ?? 5);
/** How long the breaker stays open before allowing a half-open probe. */
const CIRCUIT_RESET_MS = Number(process.env.AI_CIRCUIT_RESET_MS ?? 30_000);

export interface GatedIdentifyResult {
  confidence: number;
  speciesId: string | null;
  careGuide: Record<string, unknown> | null;
  /** True when confidence < threshold: the species is withheld (FR-003). */
  lowConfidence: boolean;
}

/**
 * The one place business code touches the AI model. Owns the 70% confidence
 * gate, timeout/retry-with-backoff + a per-instance circuit breaker (T-161,
 * FR-030 — graceful degradation on a sustained AI outage), and structured
 * logging; delegates credit metering to CreditsService.runMeteredAction (the
 * only sanctioned paid-call path).
 *
 * The circuit breaker lives on the instance (not a module-level singleton):
 * NestJS gives this class the default singleton provider scope, so in a
 * running app there is exactly one breaker per process — but it also means
 * every `new AiGatewayService(...)` (unit tests) starts with fresh breaker
 * state instead of leaking failures across unrelated test cases.
 */
@Injectable()
export class AiGatewayService {
  private readonly breaker = new CircuitBreaker({
    failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
    resetTimeoutMs: CIRCUIT_RESET_MS,
  });

  constructor(
    @Inject(PLANT_AI_PROVIDER) private readonly provider: PlantAIProvider,
    private readonly credits: CreditsService,
  ) {}

  /** Identify with the confidence gate applied: below threshold → species withheld. */
  async identify(photo: Buffer): Promise<GatedIdentifyResult> {
    const result = await this.callProvider(() => this.provider.identify(photo));
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
    return this.callProvider(() => this.provider.compareHealth(previous, latest));
  }

  chat(message: string, contextPhotos: Buffer[]): Promise<ChatResult> {
    return this.callProvider(() => this.provider.chat(message, contextPhotos));
  }

  /** Sanctioned entry point for any credit-metered AI action (debit → work → refund-on-fail). */
  runMeteredAction<T>(params: MeteredActionParams<T>): Promise<T> {
    return this.credits.runMeteredAction<T>(params);
  }

  /**
   * Timeout + retry-with-backoff + circuit breaker around a single AI
   * provider call (shared `common/http/outbound` wrapper, T-161). Retrying
   * here is safe: every caller of `identify`/`compareHealth`/`chat` that
   * charges credit does so via `runMeteredAction`/`reserve`+refund, so a
   * final failure after retries still refunds the reserved credit —
   * an outage never silently consumes credit (FR-017).
   */
  private callProvider<T>(fn: () => Promise<T>): Promise<T> {
    return callOutboundService(fn, {
      label: 'AI provider',
      timeoutMs: TIMEOUT_MS,
      maxAttempts: MAX_ATTEMPTS,
      unavailableCode: ErrorCode.AI_UNAVAILABLE,
      breaker: this.breaker,
    });
  }
}
