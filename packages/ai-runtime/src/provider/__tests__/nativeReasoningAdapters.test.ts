import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createVertex } from '@ai-sdk/google-vertex/edge';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';

const prompt: LanguageModelV3CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'hi' }] },
];

describe('native reasoning adapter HTTP boundaries', () => {
  it.each([
    [
      { budgetTokens: 4096, type: 'enabled' },
      { thinking: { budget_tokens: 4096, type: 'enabled' } },
    ],
    [
      { maxReasoningEffort: 'high', type: 'adaptive' },
      { output_config: { effort: 'high' }, thinking: { type: 'adaptive' } },
    ],
  ])(
    'maps Bedrock reasoningConfig into the Converse request',
    async (reasoningConfig, expected) => {
      const request = await captureRequest((fetch) =>
        createAmazonBedrock({
          accessKeyId: 'AKIA',
          baseURL: 'https://bedrock.example.com',
          fetch,
          region: 'us-east-1',
          secretAccessKey: 'secret',
        })
          .languageModel('anthropic.claude-opus-4-7')
          .doGenerate({
            prompt,
            providerOptions: { bedrock: { reasoningConfig } },
          } as LanguageModelV3CallOptions),
      );

      expect(request.url).toBe(
        'https://bedrock.example.com/model/anthropic.claude-opus-4-7/converse',
      );
      expect(request.body).toMatchObject({ additionalModelRequestFields: expected });
    },
  );

  it('maps Vertex thinkingConfig from the vertex namespace into generateContent', async () => {
    const request = await captureRequest((fetch) =>
      createVertex({
        apiKey: 'vertex-key',
        baseURL: 'https://vertex.example.com/v1/publishers/google',
        fetch,
      })
        .languageModel('gemini-2.5-flash')
        .doGenerate({
          prompt,
          providerOptions: {
            vertex: { safetySettings: [], thinkingConfig: { thinkingBudget: 4096 } },
          },
        } as LanguageModelV3CallOptions),
    );

    expect(request.url).toBe(
      'https://vertex.example.com/v1/publishers/google/models/gemini-2.5-flash:generateContent',
    );
    expect(request.body).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingBudget: 4096 } },
      safetySettings: [],
    });
  });
});

async function captureRequest(
  run: (fetch: typeof globalThis.fetch) => PromiseLike<unknown>,
): Promise<{ body: Record<string, unknown>; url: string }> {
  let captured: { body?: BodyInit | null; url: string } | undefined;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured = { body: init?.body, url: String(input) };
    throw new Error('request captured');
  }) as typeof globalThis.fetch;

  await expect(run(fetch)).rejects.toThrow('request captured');
  if (!captured || typeof captured.body !== 'string') throw new Error('No JSON request captured');
  return { body: JSON.parse(captured.body) as Record<string, unknown>, url: captured.url };
}
