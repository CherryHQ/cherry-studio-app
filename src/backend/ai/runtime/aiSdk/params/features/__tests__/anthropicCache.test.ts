import type { LanguageModelV3CallOptions, LanguageModelV3Prompt } from '@ai-sdk/provider';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { LanguageModelMiddleware } from 'ai';

import { createAnthropicCachePlugin } from '../anthropicCache';

function extractMiddleware(provider: Provider): LanguageModelMiddleware {
  const context = { middlewares: [] as LanguageModelMiddleware[] };
  createAnthropicCachePlugin(provider).configureContext?.(context as never);
  return context.middlewares[0];
}

function createProvider(cacheControl?: Provider['settings']['cacheControl']): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      developerRole: true,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
      reportsActualCost: false,
    },
    apiKeys: [],
    authType: 'api-key',
    id: 'anthropic',
    isEnabled: true,
    name: 'Anthropic',
    settings: { cacheControl },
  };
}

async function transform(provider: Provider, prompt: LanguageModelV3Prompt) {
  const middleware = extractMiddleware(provider);
  return middleware.transformParams?.({
    type: 'generate',
    params: { prompt } as LanguageModelV3CallOptions,
    model: {} as never,
  } as never);
}

describe('anthropicCache middleware', () => {
  it('leaves params untouched when cacheControl is disabled', async () => {
    const provider = createProvider({ enabled: false, tokenThreshold: 1 });
    const prompt: LanguageModelV3Prompt = [{ role: 'system', content: 'a system prompt' }];
    const result = await transform(provider, prompt);
    expect(result).toEqual({ prompt });
  });

  it('leaves params untouched when tokenThreshold is missing', async () => {
    const provider = createProvider({ enabled: true });
    const prompt: LanguageModelV3Prompt = [{ role: 'system', content: 'a system prompt' }];
    const result = await transform(provider, prompt);
    expect(result).toEqual({ prompt });
  });

  it('leaves params untouched for an empty prompt array', async () => {
    const provider = createProvider({ enabled: true, tokenThreshold: 1, cacheSystemMessage: true });
    const result = await transform(provider, []);
    expect(result).toEqual({ prompt: [] });
  });

  it('marks a system message that meets the token threshold as cacheable', async () => {
    const provider = createProvider({ enabled: true, tokenThreshold: 1, cacheSystemMessage: true });
    const prompt: LanguageModelV3Prompt = [
      { role: 'system', content: 'a reasonably long system prompt to estimate tokens from' },
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
    ];
    const result = await transform(provider, prompt);
    expect(result?.prompt?.[0]).toMatchObject({
      role: 'system',
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    });
    expect(result?.prompt?.[1]).toEqual(prompt[1]);
  });

  it('does not mark a system message below the token threshold', async () => {
    const provider = createProvider({
      enabled: true,
      tokenThreshold: 100_000,
      cacheSystemMessage: true,
    });
    const prompt: LanguageModelV3Prompt = [{ role: 'system', content: 'short' }];
    const result = await transform(provider, prompt);
    expect(result?.prompt?.[0]).toEqual(prompt[0]);
  });

  it('marks the last N qualifying non-system messages for caching', async () => {
    const provider = createProvider({ enabled: true, tokenThreshold: 1, cacheLastNMessages: 1 });
    const prompt: LanguageModelV3Prompt = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: [{ type: 'text', text: 'first user message' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'assistant reply' }] },
      { role: 'user', content: [{ type: 'text', text: 'second user message' }] },
    ];
    const result = await transform(provider, prompt);

    expect(result?.prompt?.[0]).toEqual(prompt[0]);
    expect(result?.prompt?.[1]).toEqual(prompt[1]);
    expect(result?.prompt?.[2]).toEqual(prompt[2]);
    const lastMessage = result?.prompt?.[3] as { content: { providerOptions?: unknown }[] };
    expect(lastMessage.content.at(-1)?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  it('skips system-role and empty-content messages when applying cacheLastNMessages', async () => {
    const provider = createProvider({ enabled: true, tokenThreshold: 1, cacheLastNMessages: 5 });
    const prompt: LanguageModelV3Prompt = [
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: [] },
      { role: 'user', content: [{ type: 'text', text: 'only qualifying message' }] },
    ];
    const result = await transform(provider, prompt);

    expect(result?.prompt?.[0]).toEqual(prompt[0]);
    expect(result?.prompt?.[1]).toEqual(prompt[1]);
    const lastMessage = result?.prompt?.[2] as { content: { providerOptions?: unknown }[] };
    expect(lastMessage.content.at(-1)?.providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });
});
