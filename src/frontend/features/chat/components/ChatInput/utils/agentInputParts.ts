import type { ComposerSendPayload } from '@/frontend/components/Composer';
import type { AgentInputPart } from '@/shared/contracts/agent';
import type { PluginTextReference } from '@/shared/data/types/plugin';

export function toAgentInputParts(
  { attachments, text }: ComposerSendPayload,
  pluginReferences?: PluginTextReference[],
): AgentInputPart[] {
  const parts: AgentInputPart[] = text
    ? [{ type: 'text', text, ...(pluginReferences?.length ? { pluginReferences } : {}) }]
    : [];

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
