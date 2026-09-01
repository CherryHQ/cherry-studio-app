import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import { ProfileAvatarImage } from '@/frontend/components/avatar';

type ProfileHeroProps = {
  onPress: () => void;
  userName: string;
};

export function ProfileHero({ onPress, userName }: ProfileHeroProps) {
  const { t } = useTranslation();
  const displayName = userName.trim() || t('settings.profile.setPrompt');

  return (
    <Pressable
      accessibilityLabel={t('settings.profile.edit')}
      accessibilityRole="button"
      className="items-center gap-3 px-6 py-6 active:opacity-80"
      onPress={onPress}
    >
      <ProfileAvatarImage accessibilityLabel={displayName} size={96} />
      <Text className="text-center font-medium text-base text-foreground" numberOfLines={1}>
        {displayName}
      </Text>
    </Pressable>
  );
}
