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

export function toAgentMessageListItem(message: AgentMessageView): MessageListItem | undefined {
  if (message.role !== 'user' && message.role !== 'assistant') {
    return undefined;
  }

  return {
    data: { parts: message.parts.map(toDisplayPart) },
    id: message.id,
    role: message.role,
    status: toDisplayStatus(message.status),
  };
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
): readonly MessageListItem[] {
  return messages.flatMap((message) => {
    const item = toAgentMessageListItem(message);
    return item ? [item] : [];
  });
}
