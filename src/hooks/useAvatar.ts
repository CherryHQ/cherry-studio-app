import { usePreference } from '@/hooks/data';
import { resolveUserAvatarUri } from '@/services/avatars/userAvatarStorage';

const defaultAvatarSource = require('@/assets/icon.png');

/** The user avatar as an Expo Image source, with the bundled icon as fallback. */
export function useAvatar(): string | number {
  const [avatar] = usePreference('app.user.avatar');

  return resolveUserAvatarUri(avatar) ?? defaultAvatarSource;
}
