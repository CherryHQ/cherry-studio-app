import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

type ChatInputSelectedPhotoBarProps = {
  selectedPhotoCount: number;
  onPress: () => void;
};

export function ChatInputSelectedPhotoBar({
  selectedPhotoCount,
  onPress,
}: ChatInputSelectedPhotoBarProps) {
  const { t } = useTranslation();

  if (selectedPhotoCount === 0) {
    return null;
  }

  return (
    <View className="right-0 left-0" pointerEvents="box-none">
      <Pressable
        accessibilityLabel={t('chat.media.addSelectedPhoto', { count: selectedPhotoCount })}
        accessibilityRole="button"
        className="w-[85%] items-center justify-center self-center rounded-full bg-black py-3 active:opacity-80"
        onPress={onPress}
      >
        <Text className="font-semibold text-lg text-white">
          {t('chat.media.addSelectedPhoto', { count: selectedPhotoCount })}
        </Text>
      </Pressable>
    </View>
  );
}
