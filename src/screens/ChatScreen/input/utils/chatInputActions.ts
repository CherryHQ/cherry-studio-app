import { GlobeIcon, ImageIcon, LightbulbIcon, PaperclipIcon } from 'lucide-uniwind';
import type { ComponentType } from 'react';
import type { SvgProps } from 'react-native-svg';

type ChatInputActionConfig = {
  icon: ComponentType<SvgProps>;
  id: string;
  tagTitleKey: string;
  titleKey: string;
};

export const chatInputActions = [
  {
    icon: ImageIcon,
    id: 'create-image',
    tagTitleKey: 'chat.tools.createImage',
    titleKey: 'chat.actions.createImage',
  },
  {
    icon: LightbulbIcon,
    id: 'think',
    tagTitleKey: 'chat.tools.think',
    titleKey: 'chat.actions.think',
  },
  {
    icon: GlobeIcon,
    id: 'web-search',
    tagTitleKey: 'chat.tools.webSearch',
    titleKey: 'chat.actions.webSearch',
  },
  {
    icon: PaperclipIcon,
    id: 'add-file',
    tagTitleKey: 'chat.tools.addFile',
    titleKey: 'chat.actions.addFile',
  },
] as const satisfies readonly ChatInputActionConfig[];

export type ChatInputAction = (typeof chatInputActions)[number];
export type ChatInputActionId = ChatInputAction['id'];

export function getChatInputAction(actionId: ChatInputActionId | null) {
  return chatInputActions.find((action) => action.id === actionId);
}

export function toggleChatInputAction(
  currentActionId: ChatInputActionId | null,
  nextActionId: ChatInputActionId,
) {
  return currentActionId === nextActionId ? null : nextActionId;
}
