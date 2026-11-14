import {
  canReadToolCitations,
  citableToolName,
  isCherryCitationOutput,
  toolCitationSources,
} from '@/frontend/utils/messageCitations';

import type { ConversationMessage, ResourceRead, ResourceValue } from './contracts';

type ConversationTool = NonNullable<ConversationMessage['tools']>[number];

export async function readConversationValue(
  resource: ResourceRead,
  signal: AbortSignal,
): Promise<ResourceValue> {
  signal.throwIfAborted();
  const value = resource.kind === 'inline' ? resource.value : await resource.read(signal);
  signal.throwIfAborted();
  return value;
}

export function conversationJson(value: ResourceValue): unknown {
  if (value.kind === 'json') return value.value;
  if (value.kind !== 'text') return undefined;
  try {
    return JSON.parse(value.text);
  } catch {
    return undefined;
  }
}

export async function readToolCitations(tool: ConversationTool, signal: AbortSignal) {
  if (tool.state !== 'completed' || !tool.output || !canReadToolCitations(tool.title)) return [];
  const input = tool.input
    ? conversationJson(await readConversationValue(tool.input, signal))
    : undefined;
  const wrapped = tool.title === 'tool_call' || tool.title === 'tool_invoke';
  if (
    wrapped &&
    (!input ||
      typeof input !== 'object' ||
      !('name' in input) ||
      typeof input.name !== 'string' ||
      !canReadToolCitations(input.name))
  )
    return [];
  const output = conversationJson(await readConversationValue(tool.output, signal));
  const name = citableToolName(tool.title, input, wrapped || isCherryCitationOutput(output));
  return name ? toolCitationSources(name, output) : [];
}
