import type { AgentMessageView } from '@/shared/contracts/agent';

const PREVIEW_CHARACTERS = 240;

/** Only a bounded excerpt enters native text layout; reasoning/tool payloads stay out. */
export function chatShareMessagePreview(message: AgentMessageView): string {
  const text = message.parts.findLast((part) => part.type === 'text' && part.text.trim());
  if (text?.type === 'text') {
    return text.text.slice(0, PREVIEW_CHARACTERS).replace(/\s+/g, ' ').trim();
  }
  const file = message.parts.find((part) => part.type === 'file');
  return file?.type === 'file' ? (file.name?.slice(0, PREVIEW_CHARACTERS) ?? '') : '';
}
