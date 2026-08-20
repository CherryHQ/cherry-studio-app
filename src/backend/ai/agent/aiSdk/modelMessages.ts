import type { AssistantContent, ModelMessage } from 'ai';

import type { RuntimeExecutionRequest, RuntimeMessagePart } from '../types';

/**
 * Convert a normalized {@link RuntimeExecutionRequest} into AI SDK model
 * messages: history first, then the turn input as a trailing user message.
 *
 * Contract-to-SDK shape differences handled here:
 * - The contract keeps `tool-result` parts inside assistant messages; the AI
 *   SDK requires them in `tool`-role messages, so an assistant message is
 *   flushed and a tool message inserted at each result boundary.
 * - Contract `tool-result` parts carry no tool name; it is recovered from the
 *   matching `tool-call` part earlier in the history.
 *
 * File parts are not mapped: the runtime declares `attachments: false` and
 * rejects them before execution.
 */
export function toModelMessages(request: RuntimeExecutionRequest): ModelMessage[] {
  const messages: ModelMessage[] = [];
  const toolNamesByCallId = new Map<string, string>();
  for (const message of request.history) {
    for (const part of message.parts) {
      if (part.type === 'tool-call') {
        toolNamesByCallId.set(part.toolCallId, part.toolName);
      }
    }
  }

  for (const message of request.history) {
    if (message.role === 'system') {
      const text = collectText(message.parts);
      if (text.length > 0) {
        messages.push({ role: 'system', content: text });
      }
      continue;
    }
    if (message.role === 'user') {
      const text = collectText(message.parts);
      messages.push({ role: 'user', content: [{ type: 'text', text }] });
      continue;
    }
    appendAssistantParts(messages, message.parts, toolNamesByCallId);
  }

  const inputText = request.input
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
  if (inputText.length > 0) {
    messages.push({ role: 'user', content: [{ type: 'text', text: inputText }] });
  }

  return messages;
}

function collectText(parts: RuntimeMessagePart[]): string {
  return parts
    .flatMap((part) => (part.type === 'text' || part.type === 'reasoning' ? [part.text] : []))
    .join('\n');
}

function appendAssistantParts(
  messages: ModelMessage[],
  parts: RuntimeMessagePart[],
  toolNamesByCallId: Map<string, string>,
): void {
  let pending: Exclude<AssistantContent, string> = [];
  const flush = () => {
    if (pending.length > 0) {
      messages.push({ role: 'assistant', content: pending });
      pending = [];
    }
  };

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        pending.push({ type: 'text', text: part.text });
        break;
      case 'reasoning':
        pending.push({ type: 'reasoning', text: part.text });
        break;
      case 'tool-call':
        pending.push({
          type: 'tool-call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
        break;
      case 'tool-result': {
        flush();
        const toolName = toolNamesByCallId.get(part.toolCallId) ?? 'unknown';
        messages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: part.toolCallId,
              toolName,
              output: part.isError
                ? { type: 'error-json', value: part.output }
                : { type: 'json', value: part.output },
            },
          ],
        });
        break;
      }
      default:
        // File parts are rejected before execution (attachments: false).
        break;
    }
  }
  flush();
}
