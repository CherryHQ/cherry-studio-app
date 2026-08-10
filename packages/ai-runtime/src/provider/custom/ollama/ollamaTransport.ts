import type { FetchFunction } from '@ai-sdk/provider-utils';

import type { ImageGenerationSubmitInput, ImageGenerationTransport } from '../imageGenerationModel';

/**
 * Ollama single-shot image transport. POSTs `${baseURL}/generate` — the same
 * `/api/generate` endpoint Ollama uses for text completion, just pointed at an
 * image model id (e.g. `x/z-image-turbo`) — and reads the base64 `image` field
 * back synchronously, so this transport only implements `submit()`.
 *
 * `width`/`height` (from `size`) and `steps` (from `providerParams`, mapped in
 * `imageOptions.ts`) are top-level `GenerateRequest` fields; `seed` is not —
 * it must nest under `options.seed` (the same sampling-options bag the LLM
 * generate path uses), confirmed by A/B testing identical requests: a
 * top-level `seed` produced a different image each call, `options.seed`
 * reproduced the same one.
 */

// Cold-loading a multi-GB image model (e.g. x/z-image-turbo, ~12.7GB) before it
// can even start generating routinely exceeds undici's default 300s fetch
// timeout, which surfaces as an opaque "fetch failed" — give this transport a
// longer one. The timeout is expressed as an AbortSignal so the transport stays
// portable across browser, Expo and server fetch implementations.
const IMAGE_GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

function createTimeoutSignal(parent?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parent?.reason);
  if (parent?.aborted) abortFromParent();
  else parent?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error('Ollama image generation timed out')),
    IMAGE_GENERATION_TIMEOUT_MS,
  );

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', abortFromParent);
    },
  };
}

export interface OllamaTransportSettings {
  /** Already carries the `/api` suffix, matching `ollama-ai-provider-v2`'s own baseURL convention. */
  baseURL: string;
  headers?: Record<string, string>;
  /** Caller-injected fetch (e.g. the proxy-aware `customFetch`); falls back to global `fetch` when unset. */
  fetch?: FetchFunction;
}

class OllamaTransport implements ImageGenerationTransport {
  private baseURL: string;
  private headers: Record<string, string>;
  private fetch?: FetchFunction;

  constructor(settings: OllamaTransportSettings) {
    this.baseURL = settings.baseURL;
    this.headers = settings.headers ?? {};
    this.fetch = settings.fetch;
  }

  async submit(
    input: ImageGenerationSubmitInput,
  ): Promise<{ taskId?: string; imageUrls?: string[] }> {
    const [width, height] = input.size?.split('x').map(Number) ?? [];
    const steps = input.providerParams.steps;
    const fetchImpl = this.fetch ?? fetch;
    const timeout = createTimeoutSignal(input.signal);
    let response: Response;
    try {
      response = await fetchImpl(`${this.baseURL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify({
          model: input.modelId,
          prompt: input.prompt ?? '',
          stream: false,
          ...(width !== undefined && height !== undefined && { width, height }),
          ...(typeof steps === 'number' && { steps }),
          ...(input.seed !== undefined && { options: { seed: input.seed } }),
        }),
        signal: timeout.signal,
      });
    } finally {
      timeout.cleanup();
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      throw new Error(errorData.error || 'Image generation failed');
    }

    const data = await response.json();
    if (!data.image) {
      return { imageUrls: [] };
    }
    // Return the bare base64 payload, not a `data:` URI: the patched `ai` SDK's
    // generateImage() only auto-downloads strings starting with `http(s)://`;
    // anything else is passed straight through as `GeneratedFile.data` verbatim
    // and later base64-decoded as-is, so a `data:image/png;base64,` prefix here
    // would corrupt the decode with non-base64 characters (`:`, `;`, `,`).
    return { imageUrls: [data.image] };
  }
}

export function createOllamaTransport(settings: OllamaTransportSettings): OllamaTransport {
  return new OllamaTransport(settings);
}

export type { OllamaTransport };
