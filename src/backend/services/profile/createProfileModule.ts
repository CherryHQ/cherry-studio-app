import type { ProfileModule } from '@/shared/contracts';

type ProfilePreferences = {
  readAvatar(): string;
  writeAvatar(avatar: string): Promise<void>;
};

type UserAvatarStorage = {
  replace(
    sourceUri: string,
    previousAvatar: string,
    persist: (avatar: string) => Promise<void>,
  ): Promise<void>;
  resolve(avatar: string): Promise<string | undefined>;
};

export type ProfileModuleDependencies = {
  avatars: UserAvatarStorage;
  preferences: ProfilePreferences;
};

export function createProfileModule({
  avatars,
  preferences,
}: ProfileModuleDependencies): ProfileModule {
  return {
    persistAvatar: (sourceUri) => {
      const previousAvatar = preferences.readAvatar();
      return avatars.replace(sourceUri, previousAvatar, (avatar) =>
        preferences.writeAvatar(avatar),
      );
    },
    resolveAvatar: (avatar) => avatars.resolve(avatar),
  };
}
