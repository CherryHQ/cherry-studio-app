import { GlobeIcon, ImageIcon, type AppIconProps } from '@cherrystudio/app-icons';
import type { ComponentType } from 'react';

type ChatInputActionConfig = {
  icon: ComponentType<AppIconProps>;
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
    icon: GlobeIcon,
    id: 'web-search',
    tagTitleKey: 'chat.tools.webSearch',
    titleKey: 'chat.actions.webSearch',
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
