import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { MessageRuntimeTimingSink } from '@cherrystudio/universal/data/types/message';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import type { ChatTransport, ToolChoice, ToolSet, UIMessage } from 'ai';

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
  assistantId?: string;
  callOverrides?: CallOverrides;
  fastMode?: boolean;
  knowledgeBaseIds?: string[];
  mcpToolIds?: string[];
  reasoningEffort?: ReasoningEffortOption;
  /** In-process chat runtime hook for yielding at the next Agent step boundary. */
  shouldYield?: () => boolean;
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
 * Provider-scoped request without a model (Ai_ListModels). Falls back to
 * the assistant's bound model's provider when only `assistantId` is given.
 */
export interface ListModelsRequest {
  providerId?: string;
  assistantId?: string;
  throwOnError?: boolean;
  requestOptions?: Pick<AiTransportOptions, 'signal'>;
}

export type ChatTrigger = Parameters<ChatTransport<UIMessage>['sendMessages']>[0]['trigger'];

/** Streaming chat request. */
export interface AiStreamRequest extends AiBaseRequest {
  /** `topicId` in the future AiStreamManager path. */
  chatId: string;
  trigger: ChatTrigger;
  messageId?: string;
  messages?: UIMessage[];
  runtimeTimingSink?: MessageRuntimeTimingSink;
}
