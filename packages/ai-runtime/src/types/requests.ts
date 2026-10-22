import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';

/**
 * Per-request transport config. Mirrors desktop's IPC-safe shape, but
 * mobile callers may pass it in-process directly.
 */
export interface AiTransportOptions {
  /** Layered on top of app headers + provider settings extraHeaders; caller wins on conflict. */
  headers?: Record<string, string | undefined>;
  /** AI SDK transparent-retry override. Defaults to 0. */
  maxRetries?: number;
  /** In-process only. */
  signal?: AbortSignal;
}

export interface AiBaseRequest {
  /** Selected API key override. */
  apiKeyOverride?: string;
  /** "providerId::modelId" */
  uniqueModelId?: UniqueModelId;
  requestOptions?: AiTransportOptions;
}

/**
 * Provider-scoped request without a model (Ai_ListModels).
 */
export interface ListModelsRequest {
  providerId: string;
  throwOnError?: boolean;
  requestOptions?: Pick<AiTransportOptions, 'signal'>;
}
