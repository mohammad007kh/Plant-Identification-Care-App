import { Injectable } from '@nestjs/common';
import type {
  ChatResult,
  CompareResult,
  IdentifyResult,
  PlantAIProvider,
} from './plant-ai-provider.interface';

/**
 * Deterministic offline provider — the default when no OPENAI_API_KEY is set.
 * Lets the app (and E2E) run without reaching OpenAI (Iran reachability is the
 * founder's concern, IR-1). Confidence is overridable via STUB_AI_CONFIDENCE
 * so the 70%-gate path can be exercised deterministically.
 */
@Injectable()
export class StubPlantAIProvider implements PlantAIProvider {
  async identify(): Promise<IdentifyResult> {
    const confidence = Number(process.env.STUB_AI_CONFIDENCE ?? 0.92);
    return {
      confidence,
      speciesId: null,
      careGuide: { watering: 'weekly', light: 'bright indirect', note: 'stub result' },
    };
  }

  async compareHealth(): Promise<CompareResult> {
    return { verdict: 'unchanged' };
  }

  async chat(): Promise<ChatResult> {
    return { content: 'پاسخ نمونه (stub).' };
  }
}
