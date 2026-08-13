import { CheckIcon } from '@cherrystudio/app-icons';
import { Composer } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { type ChatInputActionId, chatInputActions } from '../utils/chatInputActions';

type ChatInputMenuItemsProps = {
  onActionPress: (actionId: ChatInputActionId) => void;
  selectedToolId: ChatInputActionId | null;
};

/**
 * Chat's tools, appended to the composer's ＋ menu below the media rows. They
 * are a chat concept — painting has nothing to do with web search — so the
 * composer takes them as a slot rather than knowing they exist.
 */
export function ChatInputMenuItems({ onActionPress, selectedToolId }: ChatInputMenuItemsProps) {
  const { t } = useTranslation();

  return chatInputActions.map((action) => {
    const Icon = action.icon;
    const isSelected = action.id === selectedToolId;

    return (
      <Composer.Menu.Item
        icon={<Icon className="size-5 text-foreground" />}
        key={action.id}
        label={t(action.titleKey)}
        onPress={() => onActionPress(action.id)}
        selected={isSelected}
        trailing={isSelected ? <CheckIcon className="size-5 text-foreground" /> : null}
      />
    );
  });
}
