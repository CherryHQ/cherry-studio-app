export type AppIcon = 'community' | 'enterprise';

export type AppIconState = Readonly<{
  isSupported: boolean;
  followsAccount: boolean;
  isBusy: boolean;
}>;

/** Installation-wide consent; neither account switching nor backup imports change this choice. */
export interface AppIconModule {
  getState(): AppIconState;
  subscribe(listener: () => void): () => void;
  /** Disabling also restores the community icon. Rejects if the native change fails. */
  setFollowAccount(enabled: boolean): Promise<void>;
}
