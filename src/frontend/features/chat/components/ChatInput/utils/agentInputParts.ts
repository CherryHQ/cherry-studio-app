import type { ComposerSendPayload } from '@/frontend/components/Composer';
import type { AgentInputPart } from '@/shared/contracts/agent';
import type { PluginTextReference } from '@/shared/data/types/plugin';
import type { SkillTextReference } from '@/shared/data/types/skill';

export function toAgentInputParts(
  { attachments, text }: ComposerSendPayload,
  pluginReferences?: PluginTextReference[],
  skillReferences?: SkillTextReference[],
): AgentInputPart[] {
  const parts: AgentInputPart[] = text
    ? [
        {
          type: 'text',
          text,
          ...(pluginReferences?.length ? { pluginReferences } : {}),
          ...(skillReferences?.length ? { skillReferences } : {}),
        },
      ]
    : [];

  for (const attachment of attachments) {
    parts.push({
      type: 'file',
      fileEntryId: attachment.fileEntryId,
      mediaType: attachment.mediaType,
      filename: attachment.name,
    });
  }

  return parts;
}
