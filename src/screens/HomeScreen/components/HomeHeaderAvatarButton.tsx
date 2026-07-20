import { View } from 'react-native';

import { ProfileAvatarImage } from '@/components/ProfileAvatar';

// Stack.Toolbar.View requires a single child with an explicit width/height.
const avatarButtonSize = 36;

/**
 * The circular user avatar in the Home tab's header-right slot. Display-only
 * for now (no press handling) — shows the persisted user avatar via
 * ProfileAvatarImage, falling back to the app icon. Wrapped in a fixed-size
 * View so the native toolbar slot can measure it.
 */
export function HomeHeaderAvatarButton() {
  return (
    <View style={{ height: avatarButtonSize, width: avatarButtonSize }}>
      <ProfileAvatarImage size={avatarButtonSize} />
    </View>
  );
}
