// Android-only: mirrors the native iOS messages-tab header actions.
import { Menu } from 'heroui-native/menu';
import { ImageIcon, MessageCircleIcon, SquarePenIcon } from 'lucide-uniwind/png';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { MessageScope } from '@/components/messageTabs';

import { MessageScopeTabs } from './MessageScopeTabs';

type MessageHeaderProps = {
  isEditing: boolean;
  onEditPress: () => void;
  onNewPaintingPress: () => void;
  onNewTopicPress: () => void;
  onScopeChange: (scope: MessageScope) => void;
  scope: MessageScope;
};

export const MessageHeader = memo(function MessageHeader({
  isEditing,
  onEditPress,
  onNewPaintingPress,
  onNewTopicPress,
  onScopeChange,
  scope,
}: MessageHeaderProps) {
  const { t } = useTranslation();

  return (
    <View className="h-14 flex-row items-center px-2">
      <View className="w-[88px] items-start">
        <Pressable
          accessibilityRole="button"
          className="h-11 justify-center pr-3 active:opacity-60"
          hitSlop={8}
          onPress={onEditPress}
        >
          <Text className="font-medium text-base text-primary">
            {t(isEditing ? 'common.done' : 'common.edit')}
          </Text>
        </Pressable>
      </View>
      <View className="min-w-0 flex-1 items-center">
        {isEditing ? (
          <Text className="text-center font-semibold text-lg text-foreground" numberOfLines={1}>
            {t(scope === 'drawings' ? 'painting.history.title' : 'navigation.messages')}
          </Text>
        ) : (
          <MessageScopeTabs scope={scope} onScopeChange={onScopeChange} />
        )}
      </View>
      <View className="w-[88px] items-end">
        {isEditing ? null : (
          <View className="flex-row rounded-3xl bg-field android:shadow-sm">
            <Menu presentation="popover">
              <Menu.Trigger asChild>
                <Pressable
                  accessibilityLabel={t('navigation.new')}
                  accessibilityRole="button"
                  className="size-11 items-center justify-center rounded-3xl active:opacity-60"
                  hitSlop={8}
                  testID="topic-create-menu"
                >
                  <SquarePenIcon className="size-5 text-foreground" strokeWidth={2} />
                </Pressable>
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Overlay />
                <Menu.Content align="end" placement="bottom" presentation="popover" width={210}>
                  <Menu.Item
                    className="flex-row items-center gap-3"
                    onPress={onNewTopicPress}
                    testID="topic-create-chat"
                  >
                    <MessageCircleIcon className="size-5 text-foreground" strokeWidth={2} />
                    <Menu.ItemTitle>{t('navigation.newChat')}</Menu.ItemTitle>
                  </Menu.Item>
                  <Menu.Item
                    className="flex-row items-center gap-3"
                    onPress={onNewPaintingPress}
                    testID="topic-create-painting"
                  >
                    <ImageIcon className="size-5 text-foreground" strokeWidth={2} />
                    <Menu.ItemTitle>{t('navigation.newPainting')}</Menu.ItemTitle>
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu>
          </View>
        )}
      </View>
    </View>
  );
});
