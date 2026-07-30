import { useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';

const defaultAvatarSource = require('@/assets/icon.png');

/** The user avatar as an Expo Image source, with the bundled icon as fallback. */
export function useAvatar(): string | number {
  const [avatar] = usePreference('app.user.avatar');
  const profile = useBackendModule('profile');

  return profile.resolveAvatar(avatar) ?? defaultAvatarSource;
}
