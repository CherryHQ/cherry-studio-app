import type {
  ImageModelV3,
  LanguageModelV3,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { ProviderExtension, extensionRegistry } from '@cherrystudio/ai-core/provider';
import { simulateReadableStream } from 'ai';
import { MockProviderV3, mockValues } from 'ai/test';

export const CONTRACT_ADAPTER_ID = 'openai-compatible';

export const CONTRACT_USAGE: LanguageModelV3Usage = {
  inputTokens: {
    cacheRead: 2,
    cacheWrite: 1,
    noCache: 7,
    total: 10,
  },
  outputTokens: {
    reasoning: 1,
    text: 4,
    total: 5,
  },
};

type ContractModels = {
  image?: ImageModelV3;
  language?: LanguageModelV3;
};

export function installMockProvider(models: ContractModels): () => void {
  const original = extensionRegistry.get(CONTRACT_ADAPTER_ID);
  if (!original) throw new Error(`Missing ${CONTRACT_ADAPTER_ID} provider extension`);

  const provider = new MockProviderV3({
    ...(models.language ? { languageModels: { [models.language.modelId]: models.language } } : {}),
    ...(models.image ? { imageModels: { [models.image.modelId]: models.image } } : {}),
  });

  extensionRegistry.unregister(CONTRACT_ADAPTER_ID);
  extensionRegistry.register(
    ProviderExtension.create({
      create: () => provider,
      name: CONTRACT_ADAPTER_ID,
      supportsImageGeneration: true,
    }),
  );

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    extensionRegistry.unregister(CONTRACT_ADAPTER_ID);
    extensionRegistry.register(original);
  };
}

export function textStreamResult(
  text: string,
  options: { id?: string; usage?: LanguageModelV3Usage } = {},
): LanguageModelV3StreamResult {
  const id = options.id ?? 'text-1';
  return streamResult([
    { type: 'stream-start', warnings: [] },
    { id, type: 'text-start' },
    { delta: text, id, type: 'text-delta' },
    { id, type: 'text-end' },
    {
      finishReason: { raw: 'stop', unified: 'stop' },
      type: 'finish',
      usage: options.usage ?? CONTRACT_USAGE,
    },
  ]);
}

export function toolCallStreamResult(input: {
  args: unknown;
  callId?: string;
  toolName: string;
}): LanguageModelV3StreamResult {
  return streamResult([
    { type: 'stream-start', warnings: [] },
    {
      input: JSON.stringify(input.args),
      toolCallId: input.callId ?? 'tool-call-1',
      toolName: input.toolName,
      type: 'tool-call',
    },
    {
      finishReason: { raw: 'tool_calls', unified: 'tool-calls' },
      type: 'finish',
      usage: CONTRACT_USAGE,
    },
  ]);
}

export function streamResult(
  chunks: LanguageModelV3StreamPart[],
  options: { chunkDelayInMs?: number | null; initialDelayInMs?: number | null } = {},
): LanguageModelV3StreamResult {
  return {
    stream: simulateReadableStream({
      chunks,
      chunkDelayInMs: options.chunkDelayInMs ?? null,
      initialDelayInMs: options.initialDelayInMs ?? null,
    }),
  };
}

export function streamSequence(
  ...results: LanguageModelV3StreamResult[]
): LanguageModelV3['doStream'] {
  const next = mockValues(...results);
  return async () => next();
}

export function textGenerateResult(
  text: string,
  usage: LanguageModelV3Usage = CONTRACT_USAGE,
): LanguageModelV3GenerateResult {
  return {
    content: [{ text, type: 'text' }],
    finishReason: { raw: 'stop', unified: 'stop' },
    usage,
    warnings: [],
  };
}
