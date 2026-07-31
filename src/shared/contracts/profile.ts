export interface ProfileBackend {
  persistAvatar(sourceUri: string): Promise<void>;
  resolveAvatar(avatar: string): string | undefined;
}
