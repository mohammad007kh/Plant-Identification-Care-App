/**
 * The single boundary between business code and the AI model. Every model call
 * (identify / compare / chat) goes through this port; the concrete adapter
 * (stub in dev/test, OpenAI+LangChain in prod) is chosen by DI. Swapping
 * providers = a new adapter + a config flip, never a business-code change.
 */

export interface IdentifyResult {
  /** 0..1 model confidence. The 70% gate lives in AiGatewayService, not here. */
  confidence: number;
  /** Species catalog id the model matched, or null when it cannot say. */
  speciesId: string | null;
  /** Structured care guide (jsonb-shaped) or null. */
  careGuide: Record<string, unknown> | null;
}

export type HealthVerdict = 'improved' | 'worse' | 'unchanged';

export interface CompareResult {
  verdict: HealthVerdict;
}

export interface ChatResult {
  content: string;
}

export interface PlantAIProvider {
  identify(photo: Buffer): Promise<IdentifyResult>;
  compareHealth(previous: Buffer, latest: Buffer): Promise<CompareResult>;
  chat(message: string, contextPhotos: Buffer[]): Promise<ChatResult>;
}

/** DI token for the active PlantAIProvider implementation. */
export const PLANT_AI_PROVIDER = Symbol('PLANT_AI_PROVIDER');
