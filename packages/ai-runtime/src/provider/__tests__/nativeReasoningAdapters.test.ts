import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createVertex } from '@ai-sdk/google-vertex/edge';
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { createOllama } from 'ollama-ai-provider-v2';

const prompt: LanguageModelV3CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'hi' }] },
];

describe('native reasoning adapter HTTP boundaries', () => {
  it.each([
    [false, false],
    ['high', 'high'],
  ])('sends Ollama think=%s without coercing the registry value', async (think, expected) => {
    const request = await captureRequest((fetch) =>
      createOllama({ baseURL: 'http://127.0.0.1:11434/api', fetch })
        .languageModel('qwen3:8b')
        .doGenerate({
          prompt,
          providerOptions: { ollama: { options: { num_ctx: 32_768 }, think } },
        } as LanguageModelV3CallOptions),
    );

    expect(request.url).toBe('http://127.0.0.1:11434/api/chat');
    expect(request.body).toMatchObject({
      model: 'qwen3:8b',
      options: { num_ctx: 32_768 },
      think: expected,
    });
  });

  it('nests Ollama sampling parameters inside options beside the configured context', async () => {
    const request = await captureRequest((fetch) =>
      createOllama({ baseURL: 'http://127.0.0.1:11434/api', fetch })
        .languageModel('qwen3:8b')
        .doGenerate({
          prompt,
          providerOptions: { ollama: { options: { num_ctx: 32_768 }, think: 'medium' } },
          temperature: 0.7,
          topP: 0.8,
        } as LanguageModelV3CallOptions),
    );

    expect(request.body).toMatchObject({
      options: { num_ctx: 32_768, temperature: 0.7, top_p: 0.8 },
      think: 'medium',
    });
    expect(request.body).not.toHaveProperty('temperature');
    expect(request.body).not.toHaveProperty('top_p');
  });

  it('emits Ollama reasoning before text and skips empty text chunks', async () => {
    const fetch = (async () =>
      new Response(
        [
          {
            created_at: '2026-08-02T00:00:00.000Z',
            done: false,
            message: { content: '', role: 'assistant', thinking: 'plan' },
            model: 'qwen3:8b',
          },
          {
            created_at: '2026-08-02T00:00:00.000Z',
            done: false,
            message: { content: 'answer', role: 'assistant' },
            model: 'qwen3:8b',
          },
          {
            created_at: '2026-08-02T00:00:00.000Z',
            done: true,
            done_reason: 'stop',
            message: { content: '', role: 'assistant' },
            model: 'qwen3:8b',
          },
        ]
          .map((chunk) => JSON.stringify(chunk))
          .join('\n') + '\n',
        { headers: { 'content-type': 'application/x-ndjson' } },
      )) as typeof globalThis.fetch;
    const result = await createOllama({ baseURL: 'http://127.0.0.1:11434/api', fetch })
      .languageModel('qwen3:8b')
      .doStream({ prompt } as LanguageModelV3CallOptions);

    const chunks = await collectStreamParts(result.stream);
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      'response-metadata',
      'reasoning-start',
      'reasoning-delta',
      'text-start',
      'text-delta',
      'text-end',
      'reasoning-end',
      'finish',
    ]);
  });

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

async function collectStreamParts(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<LanguageModelV3StreamPart[]> {
  const reader = stream.getReader();
  const chunks: LanguageModelV3StreamPart[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}
