import type {
  Api as PiApi,
  AssistantMessage,
  Message as PiMessage,
  Model as PiModel,
  ToolResultMessage,
  Usage as PiUsage,
} from '@earendil-works/pi-ai';

import type { RuntimeExecutionRequest, RuntimeJsonValue, RuntimeMessagePart } from '../types';

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
  prompt: Extract<PiMessage, { role: 'user' }>;
  systemPrompt: string;
};

/** Convert the complete normalized Runtime context into one fresh Pi conversation. */
export function toPiConversation(
  request: RuntimeExecutionRequest,
  model: PiModel<PiApi>,
): PiConversation {
  const history: PiMessage[] = [];
  const systemParts = request.instructions.length > 0 ? [request.instructions] : [];
  const providerNamesByCallId = collectProviderNames(request);

  for (const message of request.history) {
    if (message.role === 'system') {
      const text = collectText(message.parts);
      if (text.length > 0) systemParts.push(text);
      continue;
    }
    if (message.role === 'user') {
      history.push({ role: 'user', content: collectText(message.parts), timestamp: Date.now() });
      continue;
    }
    appendAssistantHistory(history, message.parts, providerNamesByCallId, model);
  }

  const promptText = request.input
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('\n');

  return {
    history,
    prompt: { role: 'user', content: promptText, timestamp: Date.now() },
    systemPrompt: systemParts.join('\n\n'),
  };
}

function collectProviderNames(request: RuntimeExecutionRequest): Map<string, string> {
  const result = new Map<string, string>();
  for (const message of request.history) {
    for (const part of message.parts) {
      if (part.type === 'tool-call') result.set(part.toolCallId, part.providerName);
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
  model: PiModel<PiApi>,
): void {
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
        // File parts are rejected before model resolution.
        break;
    }
  }

  flushAssistant();
}
