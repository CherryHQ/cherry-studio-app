import { Composer } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { ToolMentionId } from '@/frontend/utils/toolMentions';

import { chatInputMentionActions, chatInputWebSearchAction } from '../utils/chatInputActions';

type ChatInputMenuItemsProps = {
  isWebSearchEnabled: boolean;
  onMentionPress: (mentionId: ToolMentionId) => void;
  onWebSearchChange: (enabled: boolean) => void;
};

/**
 * Chat's tools, appended to the composer's ＋ menu below the media rows. They
 * are a chat concept — painting has nothing to do with web search — so the
 * composer takes them as a slot rather than knowing they exist.
 *
 * Image generation stays visible as a mention in the draft; web search is a
 * frontend Session setting. Neither choice is persisted to Agent configuration.
 */
export function ChatInputMenuItems({
  isWebSearchEnabled,
  onMentionPress,
  onWebSearchChange,
}: ChatInputMenuItemsProps) {
  const { t } = useTranslation();
  const WebSearchIcon = chatInputWebSearchAction.icon;

  return (
    <>
      {chatInputMentionActions.map((action) => {
        const Icon = action.icon;

        return (
          <Composer.Menu.Item
            icon={<Icon className="size-5 text-foreground" />}
            key={action.id}
            label={t(action.titleKey)}
            onPress={() => onMentionPress(action.id)}
          />
        );
      })}
      <Composer.Menu.Toggle
        icon={<WebSearchIcon className="size-5 text-foreground" />}
        label={t(chatInputWebSearchAction.titleKey)}
        onValueChange={onWebSearchChange}
        value={isWebSearchEnabled}
      />
    </>
  );
}
