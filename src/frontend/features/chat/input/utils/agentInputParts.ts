import type { ComposerSendPayload } from '@/frontend/components/composer';
import type { AgentInputPart } from '@/shared/contracts/agent';

export function toAgentInputParts({ attachments, text }: ComposerSendPayload): AgentInputPart[] {
  const parts: AgentInputPart[] = text ? [{ type: 'text', text }] : [];

  for (const attachment of attachments) {
    parts.push({
      type: 'file',
      fileEntryId: attachment.fileEntryId,
      mediaType: attachment.mediaType,
      name: attachment.name,
    });
  }

  return parts;
}
