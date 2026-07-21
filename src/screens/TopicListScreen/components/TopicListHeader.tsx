// Android-only: mirrors the native iOS messages-tab header actions.
import { Menu } from 'heroui-native/menu';
import { ImageIcon, MessageCircleIcon, SquarePenIcon } from 'lucide-uniwind/png';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { TopicListScope } from '../utils/topicListScope';
import { TopicListScopeTabs } from './TopicListScopeTabs';

type TopicListHeaderProps = {
  isEditing: boolean;
  isEditVisible: boolean;
  onEditPress: () => void;
  onNewPaintingPress: () => void;
  onNewTopicPress: () => void;
  onScopeChange: (scope: TopicListScope) => void;
  scope: TopicListScope;
};

export const TopicListHeader = memo(function TopicListHeader({
  isEditing,
  isEditVisible,
  onEditPress,
  onNewPaintingPress,
  onNewTopicPress,
  onScopeChange,
  scope,
}: TopicListHeaderProps) {
  const { t } = useTranslation();

  return (
    <View className="h-14 flex-row items-center px-2">
      <View className="w-[88px] items-start">
        {isEditVisible ? (
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
        ) : null}
      </View>
      <View className="min-w-0 flex-1 items-center">
        {isEditing ? (
          <Text className="text-center font-semibold text-lg text-foreground" numberOfLines={1}>
            {t('navigation.messages')}
          </Text>
        ) : (
          <TopicListScopeTabs scope={scope} onScopeChange={onScopeChange} />
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
