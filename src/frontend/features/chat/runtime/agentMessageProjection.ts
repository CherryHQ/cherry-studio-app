import {
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  webSearchOutputSchema,
} from '@cherrystudio/universal/ai/builtinTools';

import type { MessageListItem } from '@/frontend/components/messages';
import {
  type AgentErrorView,
  type AgentMessagePart,
  type AgentMessageView,
  AgentToolResultSchema,
} from '@/shared/contracts/agent';
import { type FileEntryId, fileEntryUrl } from '@/shared/data/types/file';
import type { CherryMessagePart, MessageStatus } from '@/shared/data/types/message';
import { withCherryMeta } from '@/shared/data/types/uiParts';
import { classifyAgentFailureReason } from '@/shared/utils/agentFailure';

type SourceUrlPart = Extract<CherryMessagePart, { type: 'source-url' }>;

type AgentPartProjection = Readonly<{
  part: CherryMessagePart;
  sourceParts: readonly SourceUrlPart[];
}>;

type AgentMessageItemProjection = Readonly<{
  item: MessageListItem;
  source: AgentMessageView;
}>;

export type AgentMessageListProjectionCache = {
  items: readonly MessageListItem[];
  itemsByMessageId: Map<string, AgentMessageItemProjection>;
  partsBySource: WeakMap<AgentMessagePart, AgentPartProjection>;
};

export function createAgentMessageListProjectionCache(): AgentMessageListProjectionCache {
  return {
    items: [],
    itemsByMessageId: new Map(),
    partsBySource: new WeakMap(),
  };
}

function toDisplayStatus(status: AgentMessageView['status']): MessageStatus {
  switch (status) {
    case 'pending':
    case 'streaming':
      return 'pending';
    case 'error':
      return 'error';
    case 'cancelled':
    case 'interrupted':
      return 'paused';
    case 'success':
      return 'success';
  }
}

function toErrorPart(error: AgentErrorView): CherryMessagePart {
  const failure =
    error.failure ??
    ({
      version: 1,
      reasonCode: classifyAgentFailureReason({ code: error.code, message: error.message }),
      source: { layer: 'host', code: error.code },
    } as const);

  return {
    type: 'data-error',
    data: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...failure,
    },
  } as CherryMessagePart;
}

function toToolPart(part: Extract<AgentMessagePart, { type: 'tool' }>): CherryMessagePart {
  const base = {
    input: part.input,
    title: part.displayName,
    toolCallId: part.toolCallId,
    toolName: part.providerName,
    type: 'dynamic-tool',
  } as const;

  switch (part.state) {
    case 'input-available':
    case 'running':
      return { ...base, state: 'input-available' } as CherryMessagePart;
    case 'awaiting-approval':
      return part.approvalId
        ? ({
            ...base,
            approval: { id: part.approvalId },
            state: 'approval-requested',
          } as CherryMessagePart)
        : ({ ...base, state: 'input-available' } as CherryMessagePart);
    case 'output-available':
      return {
        ...base,
        output: unwrapToolOutput(part.output),
        state: 'output-available',
      } as CherryMessagePart;
    case 'denied':
      return {
        ...base,
        state: 'output-denied',
      } as CherryMessagePart;
    case 'error':
    case 'interrupted':
      return {
        ...base,
        errorText:
          part.error?.message ??
          (part.state === 'interrupted'
            ? 'Tool execution was interrupted.'
            : 'Tool execution failed.'),
        state: 'output-error',
      } as CherryMessagePart;
  }
}

/** Shared tool renderers consume the capability value, not the Runtime envelope. */
function unwrapToolOutput(output: Extract<AgentMessagePart, { type: 'tool' }>['output']) {
  const parsed = AgentToolResultSchema.safeParse(output);
  return parsed.success ? parsed.data.value : output;
}

function toDisplayPart(part: AgentMessagePart): CherryMessagePart {
  switch (part.type) {
    case 'text':
    case 'reasoning':
      return { type: part.type, text: part.text, state: part.state } as CherryMessagePart;
    case 'file':
      return withCherryMeta(
        {
          type: 'file',
          filename: part.name ?? 'File',
          mediaType: part.mediaType,
          url: fileEntryUrl(part.fileEntryId as FileEntryId),
        } as Extract<CherryMessagePart, { type: 'file' }>,
        { fileEntryId: part.fileEntryId },
      );
    case 'tool':
      return toToolPart(part);
    case 'error':
      return toErrorPart(part.error);
  }
}

function toSourceUrlParts(part: Extract<AgentMessagePart, { type: 'tool' }>): SourceUrlPart[] {
  if (part.state !== 'output-available' || part.toolRef.source !== 'builtin') {
    return [];
  }

  const capabilityId = part.toolRef.capabilityId;
  if (capabilityId !== WEB_SEARCH_TOOL_NAME && capabilityId !== WEB_FETCH_TOOL_NAME) {
    return [];
  }

  const result = AgentToolResultSchema.safeParse(part.output);
  if (!result.success) {
    return [];
  }

  const output = webSearchOutputSchema.safeParse(result.data.value);
  if (!output.success) {
    return [];
  }

  return output.data.map((source) => ({
    sourceId: String(source.id),
    title: source.title,
    type: 'source-url',
    url: source.url,
  }));
}

function projectAgentPart(
  part: AgentMessagePart,
  cache: AgentMessageListProjectionCache | undefined,
): AgentPartProjection {
  const cached = cache?.partsBySource.get(part);
  if (cached) {
    return cached;
  }

  const projection = {
    part: toDisplayPart(part),
    sourceParts: part.type === 'tool' ? toSourceUrlParts(part) : [],
  } satisfies AgentPartProjection;
  cache?.partsBySource.set(part, projection);
  return projection;
}

function toDisplayParts(
  parts: readonly AgentMessagePart[],
  cache?: AgentMessageListProjectionCache,
): Pick<NonNullable<MessageListItem['data']>, 'partKeys' | 'parts'> {
  const displayParts: CherryMessagePart[] = [];
  const partKeys: string[] = [];
  const sourceParts: SourceUrlPart[] = [];
  const sourcePartKeys: string[] = [];

  for (const sourcePart of parts) {
    const projection = projectAgentPart(sourcePart, cache);
    displayParts.push(projection.part);
    partKeys.push(sourcePart.id);

    projection.sourceParts.forEach((source, index) => {
      sourceParts.push(source);
      sourcePartKeys.push(`${sourcePart.id}:source:${source.sourceId ?? source.url}:${index}`);
    });
  }

  // Synthetic sources stay at the tail, but their identity is derived from the
  // tool part rather than from their changing array position.
  return {
    partKeys: [...partKeys, ...sourcePartKeys],
    parts: [...displayParts, ...sourceParts],
  };
}

function resolveMessageModel(message: AgentMessageView): MessageListItem['model'] {
  if (message.inferenceSnapshot?.status !== 'supported') {
    return undefined;
  }

  const snapshot = message.inferenceSnapshot.snapshot.model;
  const name = snapshot.name.trim();

  if (!name) {
    return undefined;
  }

  return {
    id: snapshot.uniqueModelId,
    modelId: snapshot.modelId,
    name,
    providerId: snapshot.providerId,
  };
}

export function toAgentMessageListItem(
  message: AgentMessageView,
  cache?: AgentMessageListProjectionCache,
): MessageListItem | undefined {
  if (message.role !== 'user' && message.role !== 'assistant') {
    return undefined;
  }

  const cached = cache?.itemsByMessageId.get(message.id);
  if (cached?.source === message) {
    return cached.item;
  }

  const model = resolveMessageModel(message);
  const item = {
    createdAt: message.createdAt,
    data: toDisplayParts(message.parts, cache),
    id: message.id,
    ...(model ? { model } : {}),
    role: message.role,
    status: toDisplayStatus(message.status),
  } satisfies MessageListItem;
  cache?.itemsByMessageId.set(message.id, { item, source: message });
  return item;
}

export function mergeAgentMessageViews(
  persisted: readonly AgentMessageView[],
  live: readonly AgentMessageView[],
): readonly AgentMessageView[] {
  if (live.length === 0) {
    return persisted;
  }

  const liveById = new Map(live.map((message) => [message.id, message]));
  const merged = persisted.map((message) => liveById.get(message.id) ?? message);
  const persistedIds = new Set(persisted.map((message) => message.id));

  for (const message of live) {
    if (!persistedIds.has(message.id)) {
      merged.push(message);
    }
  }

  return merged;
}

export function toAgentMessageListItems(
  messages: readonly AgentMessageView[],
  cache?: AgentMessageListProjectionCache,
): readonly MessageListItem[] {
  const items = messages.flatMap((message) => {
    const item = toAgentMessageListItem(message, cache);
    return item ? [item] : [];
  });

  if (!cache) {
    return items;
  }

  const activeMessageIds = new Set(messages.map((message) => message.id));
  for (const messageId of cache.itemsByMessageId.keys()) {
    if (!activeMessageIds.has(messageId)) {
      cache.itemsByMessageId.delete(messageId);
    }
  }

  if (
    cache.items.length === items.length &&
    cache.items.every((previousItem, index) => previousItem === items[index])
  ) {
    return cache.items;
  }

  cache.items = items;
  return items;
}
