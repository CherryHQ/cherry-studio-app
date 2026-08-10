import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { DmxapiExtension } from '../../extensions';
import { createDmxapiProvider } from './dmxapiProvider';

const prompt: LanguageModelV3CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'hi' }] },
];

describe('DMXAPI chat provider', () => {
  test.each([
    ['claude-opus-4-6', 'https://proxy.example.com/anthropic/v1/messages'],
    [
      'gemini-2.5-pro',
      'https://proxy.example.com/gemini/v1beta/models/gemini-2.5-pro:generateContent',
    ],
    ['gpt-5', 'https://proxy.example.com/chat/v1/chat/completions'],
    ['qwen3.5-plus', 'https://proxy.example.com/chat/v1/chat/completions'],
  ])('routes %s to its native protocol URL', async (modelId, expectedUrl) => {
    const request = await captureRequest((fetch) =>
      createProvider(fetch)
        .languageModel(modelId)
        .doGenerate({ prompt } as LanguageModelV3CallOptions),
    );

    expect(request.url).toBe(expectedUrl);
    if (modelId.startsWith('gemini-')) {
      expect(request.body).toMatchObject({ contents: expect.any(Array) });
    } else {
      expect(request.body).toMatchObject({ model: modelId });
    }
  });

  test('reads compatible options from the dmxapi namespace', async () => {
    const request = await captureRequest((fetch) =>
      createProvider(fetch)
        .languageModel('deepseek-v4')
        .doGenerate({
          prompt,
          providerOptions: { dmxapi: { reasoningEffort: 'high', enable_thinking: true } },
        } as LanguageModelV3CallOptions),
    );

    expect(request.body).toMatchObject({
      enable_thinking: true,
      reasoning_effort: 'high',
    });
  });

  test('exposes the migrated image-generation transport', () => {
    const provider = createProvider(vi.fn() as never);

    expect(provider.imageModel).toBeTypeOf('function');
    expect(DmxapiExtension.config.supportsImageGeneration).toBe(true);
  });
});

function createProvider(fetch: typeof globalThis.fetch) {
  return createDmxapiProvider({
    apiKey: 'sk-test',
    baseURL: 'https://proxy.example.com/chat/v1',
    endpointBaseURLs: {
      [ENDPOINT_TYPE.ANTHROPIC_MESSAGES]: 'https://proxy.example.com/anthropic/v1',
      [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'https://proxy.example.com/gemini/v1beta',
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'https://proxy.example.com/chat/v1',
    },
    fetch,
  });
}

async function captureRequest(
  run: (fetch: typeof globalThis.fetch) => PromiseLike<unknown>,
): Promise<{ body: Record<string, unknown>; url: string }> {
  let captured: { body?: BodyInit | null; url: string } | undefined;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = { body: init?.body, url: String(input) };
    return new Response('{}', { status: 200 });
  }) as typeof globalThis.fetch;

  try {
    await run(fetch);
  } catch (error) {
    if (!captured) throw error;
  }
  if (!captured || typeof captured.body !== 'string') throw new Error('No JSON request captured');
  return { body: JSON.parse(captured.body) as Record<string, unknown>, url: captured.url };
}
