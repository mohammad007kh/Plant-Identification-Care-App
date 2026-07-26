import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type {
  ChatResult,
  CompareResult,
  HealthVerdict,
  IdentifyResult,
  PlantAIProvider,
} from './plant-ai-provider.interface';

/**
 * Real provider: OpenAI via LangChain. Selected by AiGatewayModule only when
 * OPENAI_API_KEY is present; otherwise the StubPlantAIProvider is used. Vision
 * prompts send the photo as a base64 data URL. Reachability/billing from Iran
 * is the founder's responsibility (risk IR-1) — the abstraction keeps this
 * swappable for a relay or alternate provider without touching business code.
 */
@Injectable()
export class OpenAiLangchainProvider implements PlantAIProvider {
  private readonly logger = new Logger(OpenAiLangchainProvider.name);
  private modelInstance?: ChatOpenAI;

  /** Lazily constructed so DI can instantiate this class even when no key is set. */
  private get model(): ChatOpenAI {
    if (!this.modelInstance) {
      this.modelInstance = new ChatOpenAI({
        model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY,
        temperature: 0,
      });
    }
    return this.modelInstance;
  }

  private toDataUrl(photo: Buffer, mime = 'image/jpeg'): string {
    return `data:${mime};base64,${photo.toString('base64')}`;
  }

  async identify(photo: Buffer): Promise<IdentifyResult> {
    const res = await this.model.invoke([
      new SystemMessage(
        'You identify houseplants from a leaf photo. Reply ONLY with compact JSON: ' +
          '{"confidence":0..1,"scientificName":string|null,"careGuide":{"watering":string,"light":string}}',
      ),
      new HumanMessage({
        content: [
          { type: 'text', text: 'Identify this plant.' },
          { type: 'image_url', image_url: { url: this.toDataUrl(photo) } },
        ],
      }),
    ]);
    const parsed = this.parseJson(res.content);
    return {
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      speciesId: null, // catalog matching by scientificName happens in the scan service
      careGuide: (parsed.careGuide as Record<string, unknown>) ?? null,
    };
  }

  async compareHealth(previous: Buffer, latest: Buffer): Promise<CompareResult> {
    const res = await this.model.invoke([
      new SystemMessage(
        'Compare plant health between two photos (previous, then latest). Reply ONLY with ' +
          'JSON {"verdict":"improved"|"worse"|"unchanged"}.',
      ),
      new HumanMessage({
        content: [
          { type: 'image_url', image_url: { url: this.toDataUrl(previous) } },
          { type: 'image_url', image_url: { url: this.toDataUrl(latest) } },
        ],
      }),
    ]);
    const parsed = this.parseJson(res.content);
    const verdict = parsed.verdict as HealthVerdict;
    return {
      verdict: ['improved', 'worse', 'unchanged'].includes(verdict) ? verdict : 'unchanged',
    };
  }

  async chat(message: string, contextPhotos: Buffer[]): Promise<ChatResult> {
    const res = await this.model.invoke([
      new SystemMessage('You are a helpful plant-care assistant. Answer in Persian.'),
      new HumanMessage({
        content: [
          { type: 'text', text: message },
          ...contextPhotos.map((p) => ({
            type: 'image_url' as const,
            image_url: { url: this.toDataUrl(p) },
          })),
        ],
      }),
    ]);
    return { content: typeof res.content === 'string' ? res.content : JSON.stringify(res.content) };
  }

  private parseJson(content: unknown): Record<string, unknown> {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    try {
      const match = text.match(/\{[\s\S]*\}/);
      return match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
    } catch (err) {
      this.logger.warn(`Failed to parse model JSON: ${(err as Error).message}`);
      return {};
    }
  }
}
