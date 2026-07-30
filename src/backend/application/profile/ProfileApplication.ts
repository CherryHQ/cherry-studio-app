import type { ProfileBackend } from '@/shared/contracts';

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
  resolve(avatar: string): string | undefined;
};

export type ProfileApplicationDependencies = {
  avatars: UserAvatarStorage;
  preferences: ProfilePreferences;
};

export class ProfileApplication implements ProfileBackend {
  constructor(private readonly dependencies: ProfileApplicationDependencies) {}

  persistAvatar(sourceUri: string): Promise<void> {
    const previousAvatar = this.dependencies.preferences.readAvatar();
    return this.dependencies.avatars.replace(sourceUri, previousAvatar, (avatar) =>
      this.dependencies.preferences.writeAvatar(avatar),
    );
  }

  resolveAvatar(avatar: string): string | undefined {
    return this.dependencies.avatars.resolve(avatar);
  }
}
