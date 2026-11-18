import ListIcon from '@cherrystudio/app-icons/icons/list-filter';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { BackgroundPressExclusion, Button, Spinner, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import { useFocusedBackPress } from '@/frontend/appShell/navigation';

import type { ChatTurn, ChatTurnNavigator } from '../chatTurns';

const DIRECTORY_WIDTH = 296;
const MAX_LIST_HEIGHT = 264;
const PANEL_LIMIT = { width: DIRECTORY_WIDTH, maxHeight: '100%' } as const;
const LIST_LIMIT = { maxHeight: MAX_LIST_HEIGHT, flexGrow: 0 } as const;
const turnKey = (turn: ChatTurn) => turn.id;

export function ChatTurnDirectory({
  navigator,
  bottomAccessoryHeight,
  contentBottomInset,
  contentTopInset,
  keyboardOffset,
}: {
  navigator: ChatTurnNavigator;
  bottomAccessoryHeight: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  keyboardOffset: number;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  useFocusedBackPress(close, isOpen);
  const { height, progress } = useReanimatedKeyboardAnimation();
  const position = useAnimatedStyle(() => ({
    top: contentTopInset,
    bottom:
      bottomAccessoryHeight.get() +
      Math.max(0, -height.get() - progress.get() * keyboardOffset) +
      Math.max(contentBottomInset, 12),
  }));

  async function select(messageId: string) {
    close();
    const result = await navigator.jump(messageId);
    if (result === 'unavailable') toast.show({ label: t('chat.history.messageUnavailable') });
    if (result === 'retryable')
      toast.show({ label: t('chat.turns.jumpFailed'), variant: 'danger' });
  }

  return (
    <View className="absolute inset-0" pointerEvents="box-none">
      {isOpen ? (
        <BackgroundPressExclusion className="absolute inset-0">
          <Pressable accessible={false} className="absolute inset-0" onPress={close} />
        </BackgroundPressExclusion>
      ) : null}
      <Animated.View
        className="absolute inset-x-3 flex-row-reverse items-end gap-2"
        pointerEvents="box-none"
        style={position}
      >
        <BackgroundPressExclusion>
          <Button
            accessibilityLabel={t(isOpen ? 'common.close' : 'chat.turns.title')}
            accessibilityState={{ expanded: isOpen }}
            icon={isOpen ? <XIcon /> : <ListIcon />}
            onPress={() => setIsOpen((open) => !open)}
            size="footer"
            testID="chat-turn-directory-trigger"
            variant={isOpen ? 'default' : 'secondary'}
          />
        </BackgroundPressExclusion>
        {isOpen ? <ChatTurnDirectoryPanel navigator={navigator} onSelect={select} /> : null}
      </Animated.View>
    </View>
  );
}

function ChatTurnDirectoryPanel({
  navigator,
  onSelect,
}: {
  navigator: ChatTurnNavigator;
  onSelect(messageId: string): Promise<void>;
}) {
  const { i18n, t } = useTranslation();
  const turns = useQuery({
    queryKey: ['chat-turns', navigator.scope],
    queryFn: ({ signal }) => navigator.read(signal),
    gcTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });
  const rows = turns.data ?? [];

  return (
    <BackgroundPressExclusion
      className="shrink rounded-3xl border border-border bg-popover px-2 pb-2 shadow-sm"
      style={PANEL_LIMIT}
      testID="chat-turn-directory"
    >
      <Text
        accessibilityRole="header"
        className="px-2 py-3 font-semibold text-popover-foreground text-sm"
      >
        {t('chat.turns.title')}
      </Text>
      {turns.isPending ? (
        <View className="items-center py-4">
          <Spinner
            accessibilityLabel={t('chat.history.loading')}
            accessibilityRole="progressbar"
            size="sm"
          />
        </View>
      ) : turns.isError ? (
        <View className="items-start gap-2 px-2 pb-2">
          <Text className="text-popover-foreground text-sm">{t('chat.history.loadFailed')}</Text>
          <Button onPress={() => void turns.refetch()} size="sm" variant="tonal">
            {t('common.retry')}
          </Button>
        </View>
      ) : rows.length === 0 ? (
        <Text className="px-2 pb-3 text-muted-foreground text-sm">{t('chat.turns.empty')}</Text>
      ) : (
        <FlatList
          className="shrink"
          data={rows}
          keyboardShouldPersistTaps="always"
          keyExtractor={turnKey}
          renderItem={({ item, index }) => {
            const number = (rows.length - index).toLocaleString(i18n.resolvedLanguage);
            const preview = item.preview || t('chat.turns.noText');
            return (
              <Pressable
                accessibilityLabel={t('chat.turns.row', { number, preview })}
                accessibilityRole="button"
                className="min-h-11 flex-row items-center gap-2 rounded-xl px-2 py-2 active:bg-secondary"
                onPress={() => void onSelect(item.id)}
              >
                <Text className="min-w-6 text-muted-foreground text-xs tabular-nums">{number}</Text>
                <Text className="flex-1 text-popover-foreground text-sm" numberOfLines={1}>
                  {preview}
                </Text>
              </Pressable>
            );
          }}
          style={LIST_LIMIT}
        />
      )}
    </BackgroundPressExclusion>
  );
}
