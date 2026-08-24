import { Image } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import { useAvatar } from '@/frontend/hooks/useAvatar';

type ProfileHeroProps = {
  onPress: () => void;
  userName: string;
};

export function ProfileHero({ onPress, userName }: ProfileHeroProps) {
  const { t } = useTranslation();
  const avatarSource = useAvatar();
  const displayName = userName.trim() || t('settings.profile.setPrompt');

  return (
    <Pressable
      accessibilityLabel={t('settings.profile.edit')}
      accessibilityRole="button"
      className="items-center gap-3 px-6 py-6 active:opacity-80"
      onPress={onPress}
    >
      <Image
        accessibilityIgnoresInvertColors
        cachePolicy="memory-disk"
        className="size-24 rounded-full"
        contentFit="cover"
        source={avatarSource}
      />
      <Text className="text-center font-medium text-base text-foreground" numberOfLines={1}>
        {displayName}
      </Text>
    </Pressable>
  );
}
