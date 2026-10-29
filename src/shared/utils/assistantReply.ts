import type { AgentMessagePart } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';

/** Only the final answer after the last tool call is editable; execution receipts stay intact. */
export function editableAssistantReply<Part extends AgentMessagePart | CherryMessagePart>(
  parts: readonly Part[],
) {
  const lastTool = parts.findLastIndex((part) => part.type === 'dynamic-tool');
  const textParts = parts
    .slice(lastTool + 1)
    .filter((part): part is Part & { type: 'text'; text: string } => part.type === 'text');
  const text = textParts
    .map((part) => part.text)
    .filter(Boolean)
    .join('\n\n');
  return text.trim() ? { text, parts: textParts } : undefined;
}

/** Keep part identities, reasoning, files and tool results; emptied fragments preserve Pi block indexes. */
export function replaceAssistantReply(parts: AgentMessagePart[], text: string): AgentMessagePart[] {
  const reply = editableAssistantReply(parts);
  if (!reply) throw new Error('The message has no editable answer.');
  const ids = new Set(reply.parts.map((part) => part.id));
  return parts.map((part) =>
    part.type === 'text' && ids.has(part.id)
      ? { ...part, text: part.id === reply.parts[0]!.id ? text : '' }
      : part,
  );
}
