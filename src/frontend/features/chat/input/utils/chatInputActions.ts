import { GlobeIcon, PaintbrushIcon, type AppIconProps } from '@cherrystudio/app-icons';
import type { ComponentType } from 'react';

import { type ToolMentionId, toolMentions } from '@/frontend/utils/toolMentions';

/**
 * Web search is a setting on the assistant rather than a property of one
 * message: it stays on until it is turned off, and the desktop client models it
 * the same way. So the menu shows it as a switch, and the assistant record is
 * the source of truth — there is no separate composer state to keep in sync.
 */
export const chatInputWebSearchAction = {
  icon: GlobeIcon,
  titleKey: 'chat.actions.webSearch',
} as const;

// Kept next to the menu rather than in the shared mention list: the message
// list highlights mentions without drawing any of them.
const mentionIcons = {
  'create-image': PaintbrushIcon,
} satisfies Record<ToolMentionId, ComponentType<AppIconProps>>;

/**
 * Tools invoked for a single message by naming them in the draft. Picking one
 * from the menu only writes its name in; from there the text carries it, which
 * is what makes it visible in the sent message.
 */
export const chatInputMentionActions = toolMentions.map((mention) => ({
  icon: mentionIcons[mention.id],
  id: mention.id,
  titleKey: mention.titleKey,
}));
