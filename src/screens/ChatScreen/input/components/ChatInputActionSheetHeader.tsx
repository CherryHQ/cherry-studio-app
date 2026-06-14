import { InfoIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { ChatInputPhotoAccess } from '@/screens/ChatScreen/input/hooks/useChatInputPhotoPicker';

type ChatInputActionSheetHeaderProps = {
  photoAccess: ChatInputPhotoAccess | null;
  onAllPhotosPress: () => void;
  onLimitedPhotoAccessPress: () => void;
};

export function ChatInputActionSheetHeader({
  photoAccess,
  onAllPhotosPress,
  onLimitedPhotoAccessPress,
}: ChatInputActionSheetHeaderProps) {
  const { t } = useTranslation();
  const isPhotoAccessLimited = photoAccess === 'limited';

  return (
    <View className="min-h-8 flex-row items-center justify-between gap-3">
      <Text className="font-semibold text-base text-foreground">{t('common.cherryStudio')}</Text>
      {photoAccess === 'all' ? (
        <Pressable
          accessibilityLabel={t('chat.media.allPhotos')}
          accessibilityRole="button"
          className="rounded-full px-1 py-1 active:opacity-70"
          onPress={onAllPhotosPress}
        >
          <Text className="font-medium text-[#007AFF] text-sm">{t('chat.media.allPhotos')}</Text>
        </Pressable>
      ) : null}
      {isPhotoAccessLimited ? (
        <Pressable
          accessibilityLabel={t('chat.media.limitedPhotoAccess')}
          accessibilityRole="button"
          className="flex-row items-center gap-1 rounded-full px-1 py-1 active:opacity-70"
          onPress={onLimitedPhotoAccessPress}
        >
          <Text className="font-medium text-foreground text-sm">
            {t('chat.media.limitedPhotoAccess')}
          </Text>
          <InfoIcon className="size-4 text-foreground" strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}
