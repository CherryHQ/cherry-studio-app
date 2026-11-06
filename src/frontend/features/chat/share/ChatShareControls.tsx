import { BackgroundPressExclusion, Button, SelectionIndicator } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusedBackPress } from '@/frontend/appShell/navigation';
import type { MessageListItem } from '@/frontend/components/Message';

import { useChatMessageRow } from '../components/ChatWorkspace/context/ChatMessageRowContext';
import {
  useChatShareSelectionActions,
  useChatShareSelectionCount,
  useChatShareSelectionState,
  useIsChatMessageSelected,
  useIsChatShareSelecting,
} from './chatShareSelection';

/** Preserve the draft and dock measurement while selection owns the bottom controls. */
export function ChatShareComposerGuard({ children }: PropsWithChildren) {
  const isSelecting = useIsChatShareSelecting();
  return (
    <View
      accessibilityElementsHidden={isSelecting}
      importantForAccessibility={isSelecting ? 'no-hide-descendants' : 'auto'}
      pointerEvents={isSelecting ? 'none' : 'box-none'}
      className="absolute inset-0"
      style={{ opacity: isSelecting ? 0 : 1 }}
    >
      {children}
    </View>
  );
}

export function ChatShareSelectionControls() {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { isEditing, isSharing } = useChatShareSelectionState();
  const { cancelSelection, confirmSelection } = useChatShareSelectionActions();
  const count = useChatShareSelectionCount();
  useFocusedBackPress(cancelSelection, isEditing);
  if (!isEditing) return null;
  return (
    <View
      className="absolute right-0 bottom-0 left-0 border-border-subtle border-t bg-chat-background px-4 pt-3"
      style={{ paddingBottom: Math.max(bottom, 12) }}
    >
      <BackgroundPressExclusion>
        <View className="flex-row items-center gap-3">
          <Button disabled={isSharing} onPress={cancelSelection} variant="ghost">
            {t('common.cancel')}
          </Button>
          <Text className="min-w-0 flex-1 text-center text-muted-foreground text-sm">
            {t('common.selection.count', { count })}
          </Text>
          <Button disabled={!count || isSharing} loading={isSharing} onPress={confirmSelection}>
            {t('common.share')}
          </Button>
        </View>
      </BackgroundPressExclusion>
    </View>
  );
}

export function ChatShareMessageSelection({ message }: { message: MessageListItem }) {
  return useIsChatShareSelecting() ? <ActiveMessageSelection message={message} /> : null;
}

export function ChatShareSelectionSpacer({ hasAttachments }: { hasAttachments: boolean }) {
  const isSelecting = useIsChatShareSelecting();
  return isSelecting && hasAttachments ? <View className="h-8" /> : null;
}

function ActiveMessageSelection({ message }: { message: MessageListItem }) {
  const { t } = useTranslation();
  const { isSharing } = useChatShareSelectionState();
  const { toggleMessage } = useChatShareSelectionActions();
  const selected = useIsChatMessageSelected(message.id);
  const row = useChatMessageRow(message.id);
  const unavailable =
    row.completeness === 'partial' ||
    message.status === 'pending' ||
    message.status === 'streaming';
  const disabled = isSharing || (unavailable && !selected);
  return (
    <BackgroundPressExclusion className="absolute -top-2.5 -left-2.5">
      <Pressable
        accessibilityLabel={t('chat.share.selectMessage', {
          role: t(message.role === 'user' ? 'chat.share.user' : 'chat.share.assistant'),
        })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled }}
        disabled={disabled}
        className="size-11 items-center justify-center"
        onPress={() => toggleMessage(message.id)}
        testID={`chat-share-select-${message.id}`}
      >
        <View className="rounded-full bg-chat-background">
          <SelectionIndicator disabled={disabled} selected={selected} />
        </View>
      </Pressable>
    </BackgroundPressExclusion>
  );
}
