import type { MessageListItem } from '@/frontend/components/Message';
import type { ControllerDetail, ControllerMessage } from '@/shared/contracts/agent/controller';
import type { CherryMessagePart } from '@/shared/data/types/message';

export type PresentedMessage = MessageListItem & { remote: ControllerMessage };
const presentations = new WeakMap<ControllerMessage, PresentedMessage>();
export function presentRemoteMessage(message: ControllerMessage): PresentedMessage {
  const cached = presentations.get(message);
  if (cached) return cached;
  const parts: CherryMessagePart[] = [];
  const keys: string[] = [];
  for (const part of message.parts) {
    if (part.type === 'text' || part.type === 'reasoning') {
      parts.push({
        type: part.type,
        text: part.text,
        state: message.status === 'streaming' ? 'streaming' : 'done',
      });
      keys.push(part.id);
    } else if (part.type === 'code') {
      parts.push({
        type: 'data-code',
        data: { language: part.language ?? '', content: part.text },
      });
      keys.push(part.id);
    }
  }
  const result: PresentedMessage = {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    status: message.status === 'streaming' ? 'pending' : message.status,
    data: { parts, partKeys: keys },
    remote: message,
  };
  presentations.set(message, result);
  return result;
}

/** Merge the lightweight directory in PC part order, without reading any tool values. */
export function withRemoteToolSummaries(
  message: PresentedMessage,
  details: readonly ControllerDetail[],
): PresentedMessage {
  const tools = details.filter((detail) => detail.type === 'tool');
  if (!tools.length) return message;

  const order = new Map(details.map((detail, index) => [detail.id, index]));
  const entries = (message.data.parts ?? []).map((part, index) => ({
    key: message.data.partKeys![index],
    part,
  }));
  for (const detail of tools) {
    const base = {
      type: 'dynamic-tool' as const,
      toolCallId: detail.id,
      toolName: detail.name ?? 'tool',
      input: undefined,
    };
    const state = remoteToolState(detail, message.status === 'pending');
    const part: CherryMessagePart =
      state === 'output-error'
        ? { ...base, state, errorText: '' }
        : state === 'output-available'
          ? { ...base, state, output: undefined }
          : { ...base, state };
    entries.push({ key: detail.id, part });
  }
  entries.sort((a, b) => (order.get(a.key) ?? Infinity) - (order.get(b.key) ?? Infinity));
  return {
    ...message,
    data: {
      ...message.data,
      parts: entries.map((entry) => entry.part),
      partKeys: entries.map((entry) => entry.key),
    },
  };
}

function remoteToolState(detail: ControllerDetail, isStreaming: boolean) {
  if (detail.state === 'output-error' || detail.fields.some((field) => field.name === 'error'))
    return 'output-error';
  if (detail.state === 'output-denied') return 'output-available';
  if (detail.state === 'output-available' || detail.fields.some((field) => field.name === 'output'))
    return 'output-available';
  if (!isStreaming) return 'output-available';
  return detail.state === 'input-streaming' ? 'input-streaming' : 'input-available';
}
