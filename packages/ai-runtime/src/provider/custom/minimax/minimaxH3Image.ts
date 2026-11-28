import {
  type ImageModelV3,
  type ImageModelV3CallOptions,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';

import { DEFAULT_IMAGE_REQUEST_TIMEOUT_MS } from '../../../constants';
import { createTimeoutSignal } from '../transportUtils';
import type { MinimaxImageModelConfig } from './MinimaxImageModel';

export function isMinimaxH3ImageModel(modelId: string): boolean {
  return modelId === 'MiniMax-H3-Image' || modelId === 'MiniMax-H3-Image-Highspeed';
}

const imageResponse = createJsonResponseHandler(
  z.object({
    data: z
      .array(
        z.union([
          z.object({ error: z.object({ code: z.string(), message: z.string() }) }),
          z.object({ url: z.url() }),
          z.object({ b64_json: z.string().min(1) }),
        ]),
      )
      .min(1),
    usage: z
      .object({ input_tokens: z.number(), output_tokens: z.number(), total_tokens: z.number() })
      .optional(),
  }),
);
const errorResponse = createJsonErrorResponseHandler({
  errorSchema: z.object({ error: z.object({ message: z.string() }) }),
  errorToMessage: (value) => value.error.message,
  isRetryable: () => false,
});

export async function generateMinimaxH3Image(
  modelId: string,
  config: MinimaxImageModelConfig,
  options: ImageModelV3CallOptions,
): Promise<Awaited<ReturnType<ImageModelV3['doGenerate']>>> {
  if (options.files?.length || options.mask) {
    throw new UnsupportedFunctionalityError({ functionality: 'MiniMax H3 image editing' });
  }
  const endpoint = new URL(config.url({ modelId, path: '/images/generations' }));
  // The bundled China preset still uses the legacy API origin.
  if (endpoint.origin === 'https://api.minimaxi.com') endpoint.hostname = 'api.minimax.cn';
  const url = endpoint.toString();
  const bag = options.providerOptions.minimax ?? {};
  const body = {
    model: modelId,
    prompt: options.prompt,
    n: options.n,
    size: options.size,
    aspect_ratio: options.size ? undefined : options.aspectRatio,
    area: options.size ? undefined : bag.area,
    output_format: bag.output_format,
    output_compression: bag.output_compression,
    response_format: bag.response_format,
    disable_prompt_enhanced: bag.disable_prompt_enhanced,
    aigc_watermark: endpoint.hostname === 'api.minimax.cn' ? bag.aigc_watermark : undefined,
  };
  const timeout = createTimeoutSignal(
    options.abortSignal,
    DEFAULT_IMAGE_REQUEST_TIMEOUT_MS,
    'MiniMax H3 image generation timed out',
  );
  try {
    const { value, responseHeaders } = await postJsonToApi({
      url,
      headers: combineHeaders(config.headers(), options.headers),
      body,
      successfulResponseHandler: imageResponse,
      failedResponseHandler: errorResponse,
      abortSignal: timeout.signal,
      fetch: config.fetch,
    });
    const images: string[] = [];
    const errors: string[] = [];
    for (const item of value.data) {
      if ('error' in item) errors.push(item.error.message);
      else images.push('url' in item ? item.url : item.b64_json);
    }
    if (!images.length) throw new Error(errors.join('; '));
    return {
      images,
      warnings: errors.map((message) => ({ type: 'other', message })),
      usage: value.usage && {
        inputTokens: value.usage.input_tokens,
        outputTokens: value.usage.output_tokens,
        totalTokens: value.usage.total_tokens,
      },
      response: {
        timestamp: config._internal?.currentDate?.() ?? new Date(),
        modelId,
        headers: responseHeaders,
      },
    };
  } finally {
    timeout.cleanup();
  }
}
