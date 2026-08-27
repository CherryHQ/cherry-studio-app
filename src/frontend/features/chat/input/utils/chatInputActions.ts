import type { LucideIconProps } from '@cherrystudio/app-icons';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import PaintbrushIcon from '@cherrystudio/app-icons/icons/paintbrush';
import type { ComponentType } from 'react';

import { type ToolMentionId, toolMentions } from '@/frontend/utils/toolMentions';

/** Web search is enabled by the composer for one submitted turn. */
export const chatInputWebSearchAction = {
  icon: GlobeIcon,
  titleKey: 'chat.actions.webSearch',
} as const;

// Kept next to the menu rather than in the shared mention list: the message
// list highlights mentions without drawing any of them.
const mentionIcons = {
  'create-image': PaintbrushIcon,
} satisfies Record<ToolMentionId, ComponentType<LucideIconProps>>;

/**
 * Tools invoked for one turn by naming them in the draft. The mention keeps the
 * choice visible in the sent message while the submit payload enables the
 * matching temporary capability.
 */
export const chatInputMentionActions = toolMentions.map((mention) => ({
  icon: mentionIcons[mention.id],
  id: mention.id,
  titleKey: mention.titleKey,
}));
