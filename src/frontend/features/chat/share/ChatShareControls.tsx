import {
  BackgroundPressArea,
  BackgroundPressExclusion,
  Button,
  SelectionIndicator,
} from '@cherrystudio/ui/components';
import MaskedView from '@react-native-masked-view/masked-view';
import { type PropsWithChildren, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFocusedBackPress } from '@/frontend/appShell/navigation';
import type { MessageListItem } from '@/frontend/components/Message';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { useChatMessageRow } from '../components/ChatWorkspace/context/ChatMessageRowContext';
import { useChatShareDragRow } from './ChatShareDragSelection';
import {
  useChatShareSelectionActions,
  useChatShareFooterHeight,
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
  const mask = useThemeColor('constant-black');
  const { isEditing, isSharing, isSelectingAll, allSelected } = useChatShareSelectionState();
  const { cancelSelection, confirmSelection, toggleAll } = useChatShareSelectionActions();
  const { onHeightChange } = useChatShareFooterHeight();
  const count = useChatShareSelectionCount();
  useFocusedBackPress(cancelSelection, isEditing);
  if (!isEditing) return null;
  return (
    <View
      className="absolute right-0 bottom-0 left-0 px-4 pt-7"
      onLayout={({ nativeEvent }) => onHeightChange(nativeEvent.layout.height)}
      style={{ paddingBottom: Math.max(bottom, 12) }}
    >
      <MaskedView
        pointerEvents="none"
        style={{ position: 'absolute', inset: 0 }}
        maskElement={
          <View
            className="flex-1"
            style={{
              experimental_backgroundImage: `linear-gradient(to bottom, transparent, ${mask} 38%)`,
            }}
          />
        }
      >
        <View className="flex-1 bg-chat-background" />
      </MaskedView>
      <BackgroundPressExclusion>
        <View className="flex-row items-center gap-3">
          <Button
            disabled={isSharing || isSelectingAll}
            loading={isSelectingAll}
            onPress={toggleAll}
            variant="tonal"
            size="footer"
            shape="pill"
          >
            {t(allSelected ? 'common.selection.deselectAll' : 'common.selection.selectAll')}
          </Button>
          <View className="flex-1">
            <Button
              disabled={!count || isSharing || isSelectingAll}
              loading={isSharing}
              onPress={confirmSelection}
              size="footer"
              shape="pill"
            >
              {t('common.share')}
            </Button>
          </View>
        </View>
      </BackgroundPressExclusion>
    </View>
  );
}

/** Whole-row selection preserves native body scrolling and stationary text selection. */
export function ChatShareSelectionRow({
  message,
  children,
}: PropsWithChildren<{ message: MessageListItem }>) {
  const isSelecting = useIsChatShareSelecting();
  return isSelecting ? (
    <ActiveMessageSelection message={message}>{children}</ActiveMessageSelection>
  ) : (
    children
  );
}

function ActiveMessageSelection({
  message,
  children,
}: PropsWithChildren<{ message: MessageListItem }>) {
  const { t } = useTranslation();
  const { isSharing, isSelectingAll } = useChatShareSelectionState();
  const { toggleMessage } = useChatShareSelectionActions();
  const selected = useIsChatMessageSelected(message.id);
  const row = useChatMessageRow(message.id);
  const previousSelected = useIsChatMessageSelected(
    row.showsTimestamp ? undefined : row.previousMessageId,
  );
  const nextSelected = useIsChatMessageSelected(
    row.nextShowsTimestamp ? undefined : row.nextMessageId,
  );
  const ref = useRef<ViewInstance>(null);
  const unavailable =
    row.completeness === 'partial' ||
    row.messageState === 'pending' ||
    row.messageState === 'streaming' ||
    message.status === 'pending';
  const disabled = isSharing || isSelectingAll || (unavailable && !selected);
  useChatShareDragRow(message.id, ref, !disabled);
  return (
    <View
      ref={ref}
      collapsable={false}
      className={
        message.role === 'user' && row.previousMessageId && !(selected && previousSelected)
          ? 'pt-1.5'
          : undefined
      }
    >
      <BackgroundPressArea
        disabled={disabled}
        onPress={() => toggleMessage(message.id)}
        className="flex-row py-3 pr-3 pl-1.5"
      >
        {selected ? (
          <View
            pointerEvents="none"
            className={`absolute inset-0 bg-secondary ${!previousSelected ? 'rounded-t-[22px]' : ''} ${!nextSelected ? 'rounded-b-[22px]' : ''}`}
          />
        ) : null}
        <BackgroundPressExclusion
          className={
            message.role === 'user'
              ? 'w-10 shrink-0 items-center pt-2'
              : 'w-10 shrink-0 items-center'
          }
        >
          <Pressable
            accessibilityLabel={t('chat.share.selectMessage', {
              role: t(message.role === 'user' ? 'chat.share.user' : 'chat.share.assistant'),
            })}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            hitSlop={8}
            onPress={() => toggleMessage(message.id)}
            testID={`chat-share-select-${message.id}`}
          >
            <SelectionIndicator disabled={disabled} selected={selected} />
          </Pressable>
        </BackgroundPressExclusion>
        <View className="min-w-0 flex-1">
          <SelectionExcerpt enabled={message.role === 'assistant'}>{children}</SelectionExcerpt>
        </View>
      </BackgroundPressArea>
    </View>
  );
}

function SelectionExcerpt({ children, enabled }: PropsWithChildren<{ enabled: boolean }>) {
  const mask = useThemeColor('constant-black');
  const [contentHeight, setContentHeight] = useState(0);
  const limit = 234;
  const fadeStart = ((limit - 56) / limit) * 100;
  const isClipped = enabled && contentHeight > limit;
  return (
    <View className="overflow-hidden" style={enabled ? { maxHeight: limit } : undefined}>
      <MaskedView
        style={isClipped ? { height: limit } : undefined}
        maskElement={
          <View
            className="flex-1"
            style={
              isClipped
                ? {
                    experimental_backgroundImage: `linear-gradient(to bottom, ${mask} ${fadeStart}%, transparent)`,
                  }
                : { backgroundColor: mask }
            }
          />
        }
      >
        <View onLayout={({ nativeEvent }) => setContentHeight(nativeEvent.layout.height)}>
          {children}
        </View>
      </MaskedView>
    </View>
  );
}
