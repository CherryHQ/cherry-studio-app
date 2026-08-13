import { SquarePenIcon } from '@cherrystudio/app-icons';
// Android-only: mirrors the native iOS messages-tab header actions.
import { Menu, type MenuItem } from '@cherrystudio/ui/components';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { MessageScope } from '@/frontend/components/messageTabs';

import { MessageScopeTabs } from './MessageScopeTabs';

type MessageHeaderProps = {
  isEditDisabled: boolean;
  isEditing: boolean;
  onEditPress: () => void;
  onNewPaintingPress: () => void;
  onNewTopicPress: () => void;
  onScopeChange: (scope: MessageScope) => void;
  scope: MessageScope;
};

export const MessageHeader = memo(function MessageHeader({
  isEditDisabled,
  isEditing,
  onEditPress,
  onNewPaintingPress,
  onNewTopicPress,
  onScopeChange,
  scope,
}: MessageHeaderProps) {
  const { t } = useTranslation();
  const createMenuItems = useMemo<readonly MenuItem[]>(
    () => [
      { id: 'new-chat', label: t('navigation.newChat'), onPress: onNewTopicPress },
      {
        id: 'new-painting',
        label: t('navigation.newPainting'),
        onPress: onNewPaintingPress,
      },
    ],
    [onNewPaintingPress, onNewTopicPress, t],
  );

  return (
    <View className="h-14 flex-row items-center px-2">
      <View className="w-[88px] items-start">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: isEditDisabled }}
          className="h-11 justify-center pr-3 active:opacity-60 disabled:opacity-35"
          disabled={isEditDisabled}
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
            <Menu items={createMenuItems} trigger="tap">
              <Pressable
                accessibilityLabel={t('navigation.new')}
                accessibilityRole="button"
                className="size-11 items-center justify-center rounded-3xl active:opacity-60"
                hitSlop={8}
                testID="topic-create-menu"
              >
                <SquarePenIcon className="size-5 text-foreground" />
              </Pressable>
            </Menu>
          </View>
        )}
      </View>
    </View>
  );
});
