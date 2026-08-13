import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';

export function copyAssistantMessageText(parts: readonly CherryMessagePart[]): string {
  return parts
    .map((part) => {
      switch (part.type) {
        case 'text':
          return part.text;
        case 'data-code':
          return `\`\`\`${part.data.language}\n${part.data.content}\n\`\`\``;
        case 'data-compact':
        case 'data-translation':
          return part.data.content;
        case 'data-error':
          return part.data.message ?? '';
        default:
          return '';
      }
    })
    .map((block) => block.trim())
    .filter(Boolean)
    .join('\n\n');
}
