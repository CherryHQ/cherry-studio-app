export const CONVERSATION_TURN_PREVIEW_LENGTH = 160;

export function formatConversationTurnPreview(text: string): string {
  const line = text.trim().replace(/\s+/g, ' ');
  if (line.length <= CONVERSATION_TURN_PREVIEW_LENGTH) return line;
  return `${line.slice(0, CONVERSATION_TURN_PREVIEW_LENGTH).replace(/[\uD800-\uDBFF]$/, '')}…`;
}
