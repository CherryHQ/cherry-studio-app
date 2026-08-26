import type { ImageModelV3CallOptions, LanguageModelV3CallOptions } from '@ai-sdk/provider';

export function projectLanguageCall(call: LanguageModelV3CallOptions) {
  const value = {
    abortSignal: projectSignal(call.abortSignal),
    frequencyPenalty: call.frequencyPenalty,
    headers: call.headers,
    maxOutputTokens: call.maxOutputTokens,
    presencePenalty: call.presencePenalty,
    prompt: call.prompt,
    providerOptions: call.providerOptions,
    seed: call.seed,
    stopSequences: call.stopSequences,
    temperature: call.temperature,
    toolChoice: call.toolChoice,
    tools: call.tools,
    topK: call.topK,
    topP: call.topP,
  };
  return sanitize(value, collectCitationIds(value));
}

export function projectImageCall(call: ImageModelV3CallOptions) {
  return sanitize({
    abortSignal: projectSignal(call.abortSignal),
    aspectRatio: call.aspectRatio,
    files: call.files?.map((file) =>
      file.type === 'url'
        ? { providerOptions: file.providerOptions, type: file.type, url: file.url }
        : {
            data: typeof file.data === 'string' ? file.data : Array.from(file.data),
            mediaType: file.mediaType,
            providerOptions: file.providerOptions,
            type: file.type,
          },
    ),
    headers: call.headers,
    mask: call.mask,
    n: call.n,
    prompt: call.prompt,
    providerOptions: call.providerOptions,
    seed: call.seed,
    size: call.size,
  });
}

export function projectContractValue(value: unknown) {
  return sanitize(value, collectCitationIds(value));
}

function projectSignal(signal: AbortSignal | undefined) {
  return signal ? { aborted: signal.aborted } : undefined;
}

function collectCitationIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectCitationIds(entry, ids));
    return ids;
  }
  if (typeof value !== 'object' || value === null) return ids;
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'id' && typeof entry === 'string' && /^[0-9a-f]{8}-\d+$/.test(entry)) {
      ids.add(entry);
    }
    collectCitationIds(entry, ids);
  }
  return ids;
}

function sanitize(value: unknown, citationIds: Set<string> = new Set()): unknown {
  if (value === undefined || typeof value === 'function') return undefined;
  if (typeof value === 'string') {
    return Array.from(citationIds).reduce(
      (text, citationId, index) => text.replaceAll(citationId, `<citation-${index + 1}>`),
      value,
    );
  }
  if (value instanceof Uint8Array) return Array.from(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, citationIds));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entry]) => [key, sanitize(entry, citationIds)] as const)
      .filter((entry) => entry[1] !== undefined),
  );
}
