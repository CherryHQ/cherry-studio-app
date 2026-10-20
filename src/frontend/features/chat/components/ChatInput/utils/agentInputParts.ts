import type { ComposerSendPayload } from '@/frontend/components/Composer';
import type { AgentInputPart } from '@/shared/contracts/agent';
import type { PluginTextReference } from '@/shared/data/types/plugin';
import type { SelectionTextReference } from '@/shared/data/types/selectionReference';
import type { SkillTextReference } from '@/shared/data/types/skill';

export function toAgentInputParts(
  { attachments, text }: ComposerSendPayload,
  pluginReferences?: PluginTextReference[],
  skillReferences?: SkillTextReference[],
  selectionReferences?: SelectionTextReference[],
): AgentInputPart[] {
  const parts: AgentInputPart[] = text
    ? [
        {
          type: 'text',
          text,
          ...(pluginReferences?.length ? { pluginReferences } : {}),
          ...(skillReferences?.length ? { skillReferences } : {}),
          ...(selectionReferences?.length ? { selectionReferences } : {}),
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
