import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ProfileAvatarImage } from '@/frontend/components/avatar';

// Stack.Toolbar.View requires a single child with an explicit width/height.
const avatarButtonSize = 36;

/**
 * The circular user avatar in the Home tab's header-right slot. Display-only
 * for now (no press handling) — shows the persisted user avatar via
 * ProfileAvatarImage, falling back to the app icon. Wrapped in a fixed-size
 * View so the native toolbar slot can measure it.
 */
export function HomeHeaderAvatarButton() {
  const { t } = useTranslation();

  return (
    <View style={{ height: avatarButtonSize, width: avatarButtonSize }}>
      <ProfileAvatarImage
        accessibilityLabel={t('settings.profile.avatar')}
        size={avatarButtonSize}
      />
    </View>
  );
}
