import type { ChatTransport, UIMessage } from 'ai';
import type { MessageRuntimeTimingSink } from '@/shared/data/types/message';
import type { UniqueModelId } from '@/shared/data/types/model';

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
  assistantId?: string;
  /** "providerId::modelId" */
  uniqueModelId?: UniqueModelId;
  requestOptions?: AiTransportOptions;
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
  knowledgeBaseIds?: string[];
  runtimeTimingSink?: MessageRuntimeTimingSink;
}
