export interface ProfileModule {
  persistAvatar(sourceUri: string): Promise<void>;
  resolveAvatar(avatar: string): Promise<string | undefined>;
}
