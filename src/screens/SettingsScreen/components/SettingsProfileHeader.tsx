import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import { usePreference } from '@/data/hooks';
import { SettingsEditableAvatar } from './SettingsAvatar';

const avatarSize = 72;

export function SettingsProfileHeader() {
  const { t } = useTranslation();
  const router = useRouter();
  const [userName] = usePreference('app.user.name');

  const openProfileSettings = useCallback(() => {
    router.push('/settings/profile');
  }, [router]);

  return (
    <Pressable
      accessibilityLabel={t('settings.profile.edit')}
      accessibilityRole="button"
      className="items-center gap-3 active:opacity-70"
      onPress={openProfileSettings}
    >
      <SettingsEditableAvatar icon="pencil" size={avatarSize} />
      <Text className="min-h-7 font-semibold text-2xl text-foreground" numberOfLines={1}>
        {userName}
      </Text>
    </Pressable>
  );
}
