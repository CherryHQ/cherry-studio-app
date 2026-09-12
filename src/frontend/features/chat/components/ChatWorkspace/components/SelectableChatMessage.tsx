import { SelectionIndicator } from '@cherrystudio/ui/components';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useChatShareSelection } from '../../../share';
import { ChatMessage } from './ChatMessage';

/** The left control owns selection; message content keeps its usual reading interactions. */
export function SelectableChatMessage(props: ComponentProps<typeof ChatMessage>) {
  const { t } = useTranslation();
  const { isSelecting, isSharing, selectedIds, toggleMessage } = useChatShareSelection();
  const { message } = props;
  const isSelected = selectedIds.has(message.id);
  const isDisabled = isSharing || message.status === 'pending';
  return (
    <View className="flex-row items-start gap-2">
      {isSelecting ? (
        <Pressable
          accessibilityLabel={t('chat.share.selectMessage', {
            role: t(message.role === 'user' ? 'chat.share.user' : 'chat.share.assistant'),
          })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSelected, disabled: isDisabled }}
          className="size-11 shrink-0 items-center justify-center"
          disabled={isDisabled}
          onPress={() => toggleMessage(message.id)}
          testID={`chat-share-select-${message.id}`}
        >
          <SelectionIndicator disabled={isDisabled} selected={isSelected} />
        </Pressable>
      ) : null}
      <View className="min-w-0 flex-1">
        <ChatMessage {...props} />
      </View>
    </View>
  );
}
