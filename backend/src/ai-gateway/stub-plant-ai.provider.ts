import { Injectable } from '@nestjs/common';
import type {
  ChatResult,
  CompareResult,
  IdentifyResult,
  PlantAIProvider,
} from './plant-ai-provider.interface';

/** `STUB_AI_FAIL_ACTION` values — which provider method(s) throw when `STUB_AI_FAIL=1`. */
type StubFailAction = 'identify' | 'chat' | 'compare' | 'all';

function isFailInjected(action: Exclude<StubFailAction, 'all'>): boolean {
  if (process.env.STUB_AI_FAIL !== '1') return false;
  const configured = (process.env.STUB_AI_FAIL_ACTION ?? 'all') as StubFailAction;
  return configured === 'all' || configured === action;
}

/**
 * Deterministic offline provider — the default when no OPENAI_API_KEY is set.
 * Lets the app (and E2E, T-190) run without reaching OpenAI (Iran reachability
 * is the founder's concern, IR-1). Every knob below is an env-var override,
 * read fresh on each call (so it is fixed for the lifetime of one server
 * process/boot — E2E runs that need a different value restart the server
 * with a different env, see `e2e/README`-equivalent notes in
 * `e2e/fixtures/ai-and-payment-stubs.ts`):
 *
 * - `STUB_AI_CONFIDENCE` (number, default 0.92): drives the 70%-gate path
 *   deterministically (T-190 low-confidence journey: set < 0.70).
 * - `STUB_AI_SPECIES_ID` (string, default unset → null): returned as
 *   `speciesId` so a confident identify can resolve against a real seeded
 *   `species` row (`db/seed.ts` seeds one row with a matching fixed id) —
 *   without this, the stub never matches the catalog and no scan can ever be
 *   saved as a plant (T-190 needs a saved plant to reach the chat journeys).
 * - `STUB_AI_FAIL` ('1' to enable) + `STUB_AI_FAIL_ACTION`
 *   ('identify'|'chat'|'compare'|'all', default 'all'): injects a thrown
 *   error from the selected method(s), exercising the AI-failure-refund path
 *   (T-190 journey 5) without touching the other methods' success behavior
 *   in the same server boot.
 */
@Injectable()
export class StubPlantAIProvider implements PlantAIProvider {
  async identify(): Promise<IdentifyResult> {
    if (isFailInjected('identify')) {
      throw new Error('stub AI forced failure (STUB_AI_FAIL=1, action=identify)');
    }

    const confidence = Number(process.env.STUB_AI_CONFIDENCE ?? 0.92);
    const speciesId = process.env.STUB_AI_SPECIES_ID ?? null;
    return {
      confidence,
      speciesId,
      careGuide: { watering: 'weekly', light: 'bright indirect', note: 'stub result' },
    };
  }

  async compareHealth(): Promise<CompareResult> {
    if (isFailInjected('compare')) {
      throw new Error('stub AI forced failure (STUB_AI_FAIL=1, action=compare)');
    }

    return { verdict: 'unchanged' };
  }

  async chat(): Promise<ChatResult> {
    if (isFailInjected('chat')) {
      throw new Error('stub AI forced failure (STUB_AI_FAIL=1, action=chat)');
    }

    return { content: 'پاسخ نمونه (stub).' };
  }
}
