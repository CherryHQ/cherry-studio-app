import type { ImageModelV3, ImageModelV3CallOptions } from '@ai-sdk/provider';
import type { ImageGenerationMode } from '@cherrystudio/universal/data/types/model';

import { createAbortError } from './transportUtils';

/**
 * Per-model transport routing — which endpoint to POST, whether to poll, and
 * which response family to parse. Main derives it from the registry's
 * `modes[mode].vendorTransport`, carries it through the AI SDK's internal
 * provider-options envelope, and this adapter validates it before exposing the
 * typed submit/poll channel. It is routing metadata, not a user parameter.
 */
export interface ImageTransportDescriptor {
  id: string;
  endpoint: string;
  isSync?: boolean;
  mode?: ImageGenerationMode;
}

export interface ImageGenerationTransport {
  submit(input: ImageGenerationSubmitInput): Promise<{ taskId?: string; imageUrls?: string[] }>;
  /**
   * `modelDescriptor` is carried so a poll on a fresh transport
   * instance can rebuild per-task state (e.g. DashScope's response family).
   */
  poll?(
    taskId: string,
    options: {
      signal?: AbortSignal;
      onProgress?: (progress: number) => void;
      modelDescriptor?: ImageTransportDescriptor;
    },
  ): Promise<string[]>;
  cancel?(taskId: string): Promise<void>;
}

/**
 * Provider-agnostic submit payload derived from the AI SDK call options.
 *
 * `providerParams` carries the provider-specific options bag
 * (`options.providerOptions[provider]`) by reference, so a non-JSON
 * `onProgress` callback nested in it survives to the transport.
 */
export interface ImageGenerationSubmitInput {
  modelId: string;
  prompt: string | undefined;
  n: number;
  size: `${number}x${number}` | undefined;
  aspectRatio?: `${number}:${number}`;
  seed: number | undefined;
  files: ImageModelV3CallOptions['files'];
  mask: ImageModelV3CallOptions['mask'];
  /** Per-model routing, derived in main from the registry (not a user param). */
  modelDescriptor?: ImageTransportDescriptor;
  providerParams: Record<string, unknown>;
  /**
   * Abort signal forwarded from `options.abortSignal`. Async providers
   * (ppio) ignore it (they abort during `poll()`); single-shot
   * providers (dmxapi/ovms) use it to make their one `submit()` fetch
   * cancellable, since `poll()` is never reached.
   */
  signal?: AbortSignal;
}

export interface CreateImageGenerationModelOptions {
  provider: string;
  transport: ImageGenerationTransport;
}

function readModelDescriptor(value: unknown): ImageTransportDescriptor | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const descriptor = value as Partial<ImageTransportDescriptor>;
  if (typeof descriptor.id !== 'string' || typeof descriptor.endpoint !== 'string') {
    return undefined;
  }

  return {
    id: descriptor.id,
    endpoint: descriptor.endpoint,
    ...(typeof descriptor.isSync === 'boolean' && { isSync: descriptor.isSync }),
    ...(descriptor.mode && { mode: descriptor.mode }),
  };
}

/**
 * Builds an `ImageModelV3` whose `doGenerate` runs submit→optional-poll→return-urls,
 * parameterized by an injected `ImageGenerationTransport`. It returns image **URLs**;
 * the patched `ai` SDK auto-downloads them (default download function) into a
 * `GeneratedFile` so no AiProvider/convertImageResult change is needed.
 *
 * Progress is surfaced through `options.providerOptions[provider].onProgress`
 * (typed loosely / cast — the function survives by reference through the
 * plugin chain). Abort is propagated via `options.abortSignal`.
 */
export function createImageGenerationModel(
  modelId: string,
  { provider, transport }: CreateImageGenerationModelOptions,
): ImageModelV3 {
  return {
    specificationVersion: 'v3',
    provider,
    modelId,
    maxImagesPerCall: 1,
    async doGenerate(options: ImageModelV3CallOptions) {
      const { abortSignal } = options;

      if (abortSignal?.aborted) {
        throw createAbortError('Image generation aborted');
      }

      const providerParams =
        (options.providerOptions?.[provider] as Record<string, unknown> | undefined) ?? {};
      const modelDescriptor = readModelDescriptor(providerParams.modelDescriptor);

      const onProgress =
        typeof providerParams.onProgress === 'function'
          ? (providerParams.onProgress as (progress: number) => void)
          : undefined;

      const submitResult = await transport.submit({
        modelId,
        prompt: options.prompt,
        n: options.n,
        size: options.size,
        aspectRatio: options.aspectRatio,
        seed: options.seed,
        files: options.files,
        mask: options.mask,
        modelDescriptor,
        providerParams,
        signal: abortSignal,
      });

      let urls: string[];
      if (submitResult.imageUrls) {
        urls = submitResult.imageUrls;
      } else if (submitResult.taskId) {
        if (!transport.poll) {
          throw new Error(`${provider} returned a task id but does not implement polling`);
        }

        let cancelRequested = false;
        const cancelRemoteTask = () => {
          if (cancelRequested) return;
          cancelRequested = true;
          void transport.cancel?.(submitResult.taskId as string).catch(() => {});
        };

        if (abortSignal?.aborted) {
          cancelRemoteTask();
          throw createAbortError('Image generation aborted');
        }

        abortSignal?.addEventListener('abort', cancelRemoteTask, { once: true });
        try {
          urls = await transport.poll(submitResult.taskId, {
            signal: abortSignal,
            onProgress,
            modelDescriptor,
          });
        } finally {
          abortSignal?.removeEventListener('abort', cancelRemoteTask);
        }
      } else {
        urls = [];
      }

      return {
        images: urls,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId,
          headers: {},
        },
      };
    },
  };
}
