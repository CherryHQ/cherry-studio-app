import type { ConversationInput } from '@/frontend/appShell/conversation/remote';

/** Puts a rejected input back above the draft, unless the composer already restored that text. */
export function restoreOperationInput(current: string, input: ConversationInput): string {
  const text = input.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
  if (!text || current.includes(text)) return current;
  return [text, current].filter(Boolean).join('\n');
}
