import { InfoIcon } from 'lucide-uniwind';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { withUniwind } from 'uniwind';

import type { ChatInputPhotoAccess } from '@/screens/ChatScreen/input/hooks/useChatInputPhotoPicker';

type ChatInputActionSheetHeaderProps = {
  photoAccess: ChatInputPhotoAccess | null;
  onAllPhotosPress: () => void;
  onLimitedPhotoAccessPress: () => void;
};

const StyledPressable = withUniwind(Pressable);

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
        <StyledPressable
          accessibilityLabel={t('chat.media.allPhotos')}
          accessibilityRole="button"
          className="rounded-full px-1 py-1 active:opacity-70"
          onPress={onAllPhotosPress}
        >
          <Text className="font-medium text-sm" style={styles.allPhotosText}>
            {t('chat.media.allPhotos')}
          </Text>
        </StyledPressable>
      ) : null}
      {isPhotoAccessLimited ? (
        <StyledPressable
          accessibilityLabel={t('chat.media.limitedPhotoAccess')}
          accessibilityRole="button"
          className="flex-row items-center gap-1 rounded-full px-1 py-1 active:opacity-70"
          onPress={onLimitedPhotoAccessPress}
        >
          <Text className="font-medium text-foreground text-sm">
            {t('chat.media.limitedPhotoAccess')}
          </Text>
          <InfoIcon className="size-4 text-foreground" strokeWidth={2} />
        </StyledPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  allPhotosText: {
    color: '#007AFF',
  },
});
