// Android-only: mirrors the native iOS messages-tab header actions.
import { ListFilterIcon, SquarePenIcon } from 'lucide-uniwind/png';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

type TopicListHeaderProps = {
  isEditing: boolean;
  isEditVisible: boolean;
  onEditPress: () => void;
  onFilterPress?: () => void;
  onNewTopicPress: () => void;
};

export const TopicListHeader = memo(function TopicListHeader({
  isEditing,
  isEditVisible,
  onEditPress,
  onFilterPress,
  onNewTopicPress,
}: TopicListHeaderProps) {
  const { t } = useTranslation();

  return (
    <View className="h-14 flex-row items-center px-4">
      <View className="w-24 items-start">
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
      <Text
        className="min-w-0 flex-1 text-center font-semibold text-lg text-foreground"
        numberOfLines={1}
      >
        {t('navigation.messages')}
      </Text>
      <View className="w-24 items-end">
        {isEditing ? null : (
          <View className="flex-row rounded-3xl bg-field android:shadow-sm">
            <HeaderIconButton accessibilityLabel={t('common.filter')} onPress={onFilterPress}>
              <ListFilterIcon className="size-5 text-foreground" strokeWidth={2} />
            </HeaderIconButton>
            <HeaderIconButton
              accessibilityLabel={t('navigation.newChat')}
              onPress={onNewTopicPress}
            >
              <SquarePenIcon className="size-5 text-foreground" strokeWidth={2} />
            </HeaderIconButton>
          </View>
        )}
      </View>
    </View>
  );
});

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  children: ReactNode;
  onPress?: () => void;
};

function HeaderIconButton({ accessibilityLabel, children, onPress }: HeaderIconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className="size-11 items-center justify-center rounded-3xl active:opacity-60"
      hitSlop={8}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}
