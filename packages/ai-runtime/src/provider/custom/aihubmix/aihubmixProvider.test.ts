import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { createAihubmix } from './aihubmixProvider';

const prompt: LanguageModelV3CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'hi' }] },
];

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

describe('AiHubMix chat reasoning HTTP boundary', () => {
  it("serializes reasoningEffort 'none' from providerOptions.aihubmix", async () => {
    const request = await captureRequest((fetch) =>
      createAihubmix({ apiKey: 'sk', fetch })
        .languageModel('glm-5')
        .doGenerate({
          prompt,
          providerOptions: { aihubmix: { reasoningEffort: 'none' } },
        } as LanguageModelV3CallOptions),
    );

    expect(request.url).toBe('https://aihubmix.com/v1/chat/completions');
    expect(request.body).toMatchObject({ model: 'glm-5', reasoning_effort: 'none' });
  });

  it('passes reviewed compatible-provider fields through the same namespace', async () => {
    const request = await captureRequest((fetch) =>
      createAihubmix({ apiKey: 'sk', fetch })
        .languageModel('deepseek-v4')
        .doGenerate({
          prompt,
          providerOptions: { aihubmix: { reasoningEffort: 'high', enable_thinking: true } },
        } as LanguageModelV3CallOptions),
    );

    expect(request.body).toMatchObject({
      model: 'deepseek-v4',
      reasoning_effort: 'high',
      enable_thinking: true,
    });
  });

  it.each([
    [
      'gemini-3-flash-preview',
      'https://proxy.example.com/gemini/v1beta/models/gemini-3-flash-preview:generateContent',
    ],
    ['gpt-5.4', 'https://proxy.example.com/responses/v1/responses'],
  ])('uses the resolved endpoint base URL for %s', async (modelId, expectedUrl) => {
    const request = await captureRequest((fetch) =>
      createAihubmix({
        apiKey: 'sk',
        endpointBaseURLs: {
          [ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT]: 'https://proxy.example.com/gemini/v1beta',
          [ENDPOINT_TYPE.OPENAI_RESPONSES]: 'https://proxy.example.com/responses/v1',
        },
        fetch,
      })
        .languageModel(modelId)
        .doGenerate({ prompt } as LanguageModelV3CallOptions),
    );

    expect(request.url).toBe(expectedUrl);
  });
});
