import type {
  AssistantMessage,
  ImageContent,
  Message as PiMessage,
  Model as PiModel,
  TextContent,
  ToolResultMessage,
  UserMessage,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';

import type {
  RuntimeExecutionRequest,
  RuntimeJsonValue,
  RuntimeMessage,
  RuntimeMessagePart,
} from '../types';

const EMPTY_PI_USAGE: PiUsage = {
  cacheRead: 0,
  cacheWrite: 0,
  cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
  input: 0,
  output: 0,
  totalTokens: 0,
};

export type PiConversation = {
  history: PiMessage[];
  historyTurns: PiHistoryTurn[];
  prompt: Extract<PiMessage, { role: 'user' }>;
  systemPrompt: string;
};

export type PiHistoryTurn = {
  turnId: string | null;
  messages: PiMessage[];
};

/** Convert the complete normalized Runtime context into one fresh Pi conversation. */
export function toPiConversation(
  request: RuntimeExecutionRequest,
  model: PiModel<'openai-responses'>,
): PiConversation {
  const historyTurns: PiHistoryTurn[] = [];
  const systemParts = request.instructions.length > 0 ? [request.instructions] : [];
  const providerNamesByCallId = collectProviderNames(request);

  for (const turn of request.history) {
    const historyTurn: PiHistoryTurn = { turnId: turn.turnId, messages: [] };
    for (const message of turn.messages) {
      if (message.role === 'system') {
        const text = collectText(message.parts);
        if (text.length > 0) systemParts.push(text);
        continue;
      }
      if (message.role === 'user') {
        historyTurn.messages.push({
          role: 'user',
          content: collectUserContent(message.parts),
          timestamp: Date.now(),
        });
        continue;
      }
      appendAssistantHistory(
        historyTurn.messages,
        message.parts,
        providerNamesByCallId,
        model,
        message.usage,
      );
    }
    historyTurns.push(historyTurn);
  }

  return {
    history: historyTurns.flatMap((turn) => turn.messages),
    historyTurns,
    prompt: { role: 'user', content: collectUserContent(request.input), timestamp: Date.now() },
    systemPrompt: systemParts.join('\n\n'),
  };
}

function collectUserContent(
  parts: RuntimeExecutionRequest['input'] | RuntimeMessagePart[],
): UserMessage['content'] {
  const content: (TextContent | ImageContent)[] = parts.flatMap((part) => {
    if (part.type === 'text') {
      return [{ type: 'text' as const, text: part.text }];
    }
    if (part.type === 'file') {
      return [toPiImage(part)];
    }
    return [];
  });
  return content.some((part) => part.type === 'image') ? content : collectText(parts);
}

function toPiImage(part: Extract<RuntimeMessagePart, { type: 'file' }>): ImageContent {
  const prefix = `data:${part.mediaType};base64,`;
  if (!part.uri.startsWith(prefix) || part.uri.length === prefix.length) {
    throw new Error('Runtime image content must be a matching base64 data URL.');
  }
  return { type: 'image', data: part.uri.slice(prefix.length), mimeType: part.mediaType };
}

function collectProviderNames(request: RuntimeExecutionRequest): Map<string, string> {
  const result = new Map<string, string>();
  for (const turn of request.history) {
    for (const message of turn.messages) {
      for (const part of message.parts) {
        if (part.type === 'tool-call') result.set(part.toolCallId, part.providerName);
      }
    }
  }
  return result;
}

function collectText(parts: RuntimeMessagePart[]): string {
  return parts
    .flatMap((part) => (part.type === 'text' || part.type === 'reasoning' ? [part.text] : []))
    .join('\n');
}

function appendAssistantHistory(
  history: PiMessage[],
  parts: RuntimeMessagePart[],
  providerNamesByCallId: Map<string, string>,
  model: PiModel<'openai-responses'>,
  usage: RuntimeExecutionRequest['history'][number]['messages'][number]['usage'],
): void {
  const startIndex = history.length;
  let content: AssistantMessage['content'] = [];
  const flushAssistant = () => {
    if (content.length === 0) return;
    const stopReason = content.some((part) => part.type === 'toolCall') ? 'toolUse' : 'stop';
    history.push({
      api: model.api,
      content,
      model: model.id,
      provider: model.provider,
      role: 'assistant',
      stopReason,
      timestamp: Date.now(),
      usage: EMPTY_PI_USAGE,
    });
    content = [];
  };

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        content.push({ type: 'text', text: part.text });
        break;
      case 'reasoning':
        content.push({ type: 'thinking', thinking: part.text });
        break;
      case 'tool-call':
        content.push({
          type: 'toolCall',
          id: part.toolCallId,
          name: part.providerName,
          arguments: part.input as Record<string, unknown>,
        });
        break;
      case 'tool-result': {
        flushAssistant();
        const result: ToolResultMessage<RuntimeJsonValue> = {
          role: 'toolResult',
          toolCallId: part.toolCallId,
          toolName: providerNamesByCallId.get(part.toolCallId) ?? 'unknown',
          content: [{ type: 'text', text: JSON.stringify(part.output) }],
          details: part.output,
          isError: part.isError,
          timestamp: Date.now(),
        };
        history.push(result);
        break;
      }
      default:
        // Assistant artifact files are not implicit model attachments.
        break;
    }
  }

  flushAssistant();

  if (usage) {
    const lastAssistant = history
      .slice(startIndex)
      .findLast((message): message is AssistantMessage => message.role === 'assistant');
    if (lastAssistant) lastAssistant.usage = toPiUsage(usage);
  }
}

function toPiUsage(usage: NonNullable<RuntimeMessage['usage']>): PiUsage {
  const input = usage.noCacheTokens ?? usage.inputTokens ?? 0;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    ...(usage.reasoningTokens !== undefined ? { reasoning: usage.reasoningTokens } : {}),
    totalTokens: usage.totalTokens ?? input + cacheRead + cacheWrite + output,
    cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
  };
}
