import Building2Icon from '@cherrystudio/app-icons/icons/building-2';
import ServerIcon from '@cherrystudio/app-icons/icons/server';
import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ProfileAvatarImage } from '@/frontend/components/Avatar';

type ProfileHeroProps = {
  /** The signed-in account, organization or private host shown under the name. */
  detail?: Readonly<{ label: string; icon?: 'organization' | 'server' }>;
  onPress: () => void;
  /** Offered while no account is signed in. */
  onSignIn?: () => void;
  userName: string;
};

/** The settings page's identity and account entry; it opens the profile. */
export function ProfileHero({ detail, onPress, onSignIn, userName }: ProfileHeroProps) {
  const { t } = useTranslation();
  const displayName = userName.trim() || t('settings.profile.setPrompt');
  const DetailIcon =
    detail?.icon === 'organization' ? Building2Icon : detail?.icon === 'server' ? ServerIcon : null;

  return (
    <View className="items-center gap-3 px-6 py-6">
      <Pressable
        accessibilityLabel={t('settings.profile.edit')}
        accessibilityRole="button"
        className="items-center gap-3 active:opacity-80"
        onPress={onPress}
      >
        <ProfileAvatarImage accessibilityLabel={displayName} size={96} />
        <View className="max-w-full items-center gap-1">
          <Text className="text-center font-semibold text-xl text-foreground" numberOfLines={1}>
            {displayName}
          </Text>
          {detail ? (
            <View className="max-w-full flex-row items-center gap-1.5">
              {DetailIcon ? <DetailIcon className="size-3.5 text-muted-foreground" /> : null}
              <Text className="shrink text-sm text-muted-foreground" numberOfLines={1}>
                {detail.label}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      {onSignIn ? (
        <Button onPress={onSignIn} size="sm" variant="tonal">
          {t('account.login.signIn')}
        </Button>
      ) : null}
    </View>
  );
}
