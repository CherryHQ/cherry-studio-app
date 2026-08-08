import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

type ChatInputSelectedPhotoBarProps = {
  isLoading?: boolean;
  selectedPhotoCount: number;
  onPress: () => void;
};

export function ChatInputSelectedPhotoBar({
  isLoading = false,
  selectedPhotoCount,
  onPress,
}: ChatInputSelectedPhotoBarProps) {
  const { t } = useTranslation();
  const constantWhite = useThemeColor('constant-white');

  if (selectedPhotoCount === 0) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={t('chat.media.addSelectedPhoto', { count: selectedPhotoCount })}
      accessibilityRole="button"
      className="h-[52px] min-w-[156px] max-w-[240px] items-center justify-center rounded-full bg-constant-black px-6 active:opacity-80 disabled:opacity-60"
      disabled={isLoading}
      onPress={onPress}
    >
      {isLoading ? (
        <ActivityIndicator color={constantWhite} />
      ) : (
        <Text
          adjustsFontSizeToFit
          className="font-semibold text-lg text-constant-white"
          minimumFontScale={0.8}
          numberOfLines={1}
        >
          {t('chat.media.addSelectedPhoto', { count: selectedPhotoCount })}
        </Text>
      )}
    </Pressable>
  );
}
