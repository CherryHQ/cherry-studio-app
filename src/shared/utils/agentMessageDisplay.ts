import type { AgentMessagePart, AgentMessageView } from '@/shared/contracts/agent';

const displayParts = new WeakMap<AgentMessagePart, AgentMessagePart>();

function displayPart(part: AgentMessagePart): AgentMessagePart {
  const cached = displayParts.get(part);
  if (cached) return cached;
  let projected = part;
  if (part.type === 'reasoning') {
    const hasText = part.hasText || Boolean(part.text.trim());
    if (part.text || part.hasText === undefined) projected = { ...part, text: '', hasText };
  }
  displayParts.set(part, projected);
  displayParts.set(projected, projected);
  return projected;
}

/** Presentation only. Persisted parts, provider signatures, approvals and model context stay intact. */
export function projectAgentMessageDisplay(message: AgentMessageView): AgentMessageView {
  if (message.role !== 'assistant') return message;
  const parts: AgentMessagePart[] = [];
  for (const source of message.parts) {
    const part = displayPart(source);
    const previous = parts.at(-1);
    if (part.type === 'reasoning' && previous?.type === 'reasoning') {
      parts[parts.length - 1] = {
        ...previous,
        hasText: previous.hasText || part.hasText,
        state: part.state,
      };
    } else if (part.type !== 'reasoning' || part.hasText || part.state === 'streaming')
      parts.push(part);
  }
  return parts.length === message.parts.length &&
    parts.every((part, index) => part === message.parts[index])
    ? message
    : { ...message, parts };
}
