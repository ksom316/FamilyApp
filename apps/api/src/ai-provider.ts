export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };

export type AiProvider = {
  complete(messages: ChatMessage[]): Promise<string>;
};

export type AiProviderConfig = { apiKey?: string; model?: string };

// Development-appropriate default only. OpenRouter's free-tier catalog changes over
// time — verify this model still exists (and still fits "free"/low-cost) at
// https://openrouter.ai/models before relying on it, and set OPENROUTER_MODEL
// explicitly for anything beyond local development. This is intentionally never a
// paid/premium model chosen automatically.
export const DEFAULT_OPENROUTER_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 25_000;
// Bounds both response length and, indirectly, cost per request.
const MAX_RESPONSE_TOKENS = 500;

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

function createOpenRouterProvider(apiKey: string, model: string): AiProvider {
  return {
    async complete(messages) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'X-Title': 'FamilyApp Family Brain'
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: MAX_RESPONSE_TOKENS,
            temperature: 0.4
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          // Never forward the provider's raw status body — it can carry account/billing
          // detail that has no business reaching a family member's screen.
          throw new AiProviderError(`AI provider request failed (status ${response.status}).`);
        }

        const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const reply = body.choices?.[0]?.message?.content?.trim();
        if (!reply) throw new AiProviderError('AI provider returned an empty response.');
        return reply;
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (error instanceof Error && error.name === 'AbortError') {
          throw new AiProviderError('The AI request timed out.');
        }
        throw new AiProviderError('The AI provider request failed.');
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

/**
 * Returns null when no API key is configured, so callers can surface a graceful
 * "AI is not configured" state instead of crashing. This is the seam for adding
 * another provider later — callers depend only on the AiProvider interface.
 */
export function createAiProvider(config: AiProviderConfig): AiProvider | null {
  if (!config.apiKey) return null;
  const model = config.model?.trim() || DEFAULT_OPENROUTER_MODEL;
  return createOpenRouterProvider(config.apiKey, model);
}
