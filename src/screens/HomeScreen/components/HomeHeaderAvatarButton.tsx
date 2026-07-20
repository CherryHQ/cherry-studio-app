import { View } from 'react-native';

import { ProfileAvatarImage } from '@/components/ProfileAvatar';

// Stack.Toolbar.View requires a single child with an explicit width/height.
const avatarButtonSize = 30;

/**
 * The circular user avatar in the Home tab's header-right slot. Display-only
 * for now (no press handling, no real avatar) — it reuses the app icon via
 * ProfileAvatarImage's default source. Wrapped in a fixed-size View so the
 * native toolbar slot can measure it.
 */
export function HomeHeaderAvatarButton() {
  return (
    <View style={{ height: avatarButtonSize, width: avatarButtonSize }}>
      <ProfileAvatarImage size={avatarButtonSize} />
    </View>
  );
}
