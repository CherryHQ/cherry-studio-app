import { XIcon } from '@cherrystudio/app-icons';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { ChatInputAction } from '../utils/chatInputActions';

type ChatInputToolTagProps = {
  onClear: () => void;
  tool: ChatInputAction;
};

/** The selected tool, shown above the field until it is cleared. */
export function ChatInputToolTag({ onClear, tool }: ChatInputToolTagProps) {
  const { t } = useTranslation();
  const Icon = tool.icon;

  return (
    <View className="flex-row items-center gap-1 self-start rounded-full bg-primary/10 px-2 py-1">
      <Icon className="size-5 text-primary" />
      <Text className="font-semibold text-base text-primary" numberOfLines={1}>
        {t(tool.tagTitleKey)}
      </Text>
      <Pressable
        accessibilityLabel={t('common.clear')}
        accessibilityRole="button"
        className="size-6 items-center justify-center rounded-full active:opacity-60"
        hitSlop={6}
        onPress={onClear}
      >
        <XIcon className="size-5 text-primary" />
      </Pressable>
    </View>
  );
}
