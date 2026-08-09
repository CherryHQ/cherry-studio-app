// Android-only: mirrors the native iOS messages-tab header actions.
import { DropdownMenu } from '@cherrystudio/ui/components';
import { SquarePenIcon } from 'lucide-uniwind/png';
import { memo } from 'react';
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
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Pressable
                  accessibilityLabel={t('navigation.new')}
                  accessibilityRole="button"
                  className="size-11 items-center justify-center rounded-3xl active:opacity-60"
                  hitSlop={8}
                  testID="topic-create-menu"
                >
                  <SquarePenIcon className="size-5 text-foreground" strokeWidth={2} />
                </Pressable>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                <DropdownMenu.Item key="new-chat" onSelect={onNewTopicPress}>
                  <DropdownMenu.ItemTitle>{t('navigation.newChat')}</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
                <DropdownMenu.Item key="new-painting" onSelect={onNewPaintingPress}>
                  <DropdownMenu.ItemTitle>{t('navigation.newPainting')}</DropdownMenu.ItemTitle>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </View>
        )}
      </View>
    </View>
  );
});
