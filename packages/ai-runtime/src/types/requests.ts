import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import type { ToolChoice, ToolSet } from 'ai';

/**
 * Per-request transport config. Mirrors desktop's IPC-safe shape, but
 * mobile callers may pass it in-process directly.
 */
export interface AiTransportOptions {
  /** Layered on top of app headers + provider settings extraHeaders; caller wins on conflict. */
  headers?: Record<string, string | undefined>;
  /** Idle/request timeout (ms). */
  timeout?: number;
  /** AI SDK transparent-retry override. Defaults to 0. */
  maxRetries?: number;
  /** In-process only. */
  signal?: AbortSignal;
}

export interface AiBaseRequest {
  /** Selected API key override, currently used by provider health checks. */
  apiKeyOverride?: string;
  callOverrides?: CallOverrides;
  fastMode?: boolean;
  reasoningEffort?: ReasoningEffortOption;
  /** "providerId::modelId" */
  uniqueModelId?: UniqueModelId;
  requestOptions?: AiTransportOptions;
}

/** In-process request overrides for assistant-less callers. */
export interface CallOverrides {
  maxOutputTokens?: number;
  providerOptions?: ProviderOptions;
  stopSequences?: string[];
  temperature?: number;
  toolChoice?: ToolChoice<ToolSet>;
  tools?: ToolSet;
  topK?: number;
  topP?: number;
}

/**
 * Provider-scoped request without a model (Ai_ListModels).
 */
export interface ListModelsRequest {
  providerId: string;
  throwOnError?: boolean;
  requestOptions?: Pick<AiTransportOptions, 'signal'>;
}
