import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text } from 'react-native';

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

  if (selectedPhotoCount === 0) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={t('chat.media.addSelectedPhoto', { count: selectedPhotoCount })}
      accessibilityRole="button"
      className="h-[52px] min-w-[156px] max-w-[240px] items-center justify-center rounded-full bg-black px-6 active:opacity-80 disabled:opacity-60"
      disabled={isLoading}
      onPress={onPress}
    >
      {isLoading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text
          adjustsFontSizeToFit
          className="font-semibold text-lg text-white"
          minimumFontScale={0.8}
          numberOfLines={1}
        >
          {t('chat.media.addSelectedPhoto', { count: selectedPhotoCount })}
        </Text>
      )}
    </Pressable>
  );
}
