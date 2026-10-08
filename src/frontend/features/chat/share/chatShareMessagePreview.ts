import type { ConversationMessage } from '@/frontend/appShell/conversation';

const PREVIEW_CHARACTERS = 240;

/** Only a bounded excerpt enters native text layout; reasoning/tool payloads stay out. */
export function chatShareMessagePreview(message: ConversationMessage): string {
  const parts = message.display.data.parts ?? [];
  const text = parts.findLast((part) => part.type === 'text' && part.text.trim());
  if (text?.type === 'text')
    return text.text.slice(0, PREVIEW_CHARACTERS).replace(/\s+/g, ' ').trim();
  const file = parts.find((part) => part.type === 'file');
  return (
    file?.type === 'file' ? (file.filename ?? '') : (message.attachments?.[0]?.name ?? '')
  ).slice(0, PREVIEW_CHARACTERS);
}
