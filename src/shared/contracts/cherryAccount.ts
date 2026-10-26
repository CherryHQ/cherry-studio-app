export type CherryAccountStatus = {
  configured: boolean;
  signedIn: boolean;
  displayName?: string;
  destination?: 'cloud' | 'enterprise';
  profileId?: string;
  profileUrl?: string;
};

/** Account tokens and device keys stay behind the backend boundary. */
export interface CherryAccountModule {
  getStatus(): Promise<CherryAccountStatus>;
  signIn(
    openBrowser: (url: string, redirectUri: string) => Promise<string | null>,
    signal?: AbortSignal,
  ): Promise<CherryAccountStatus>;
  signOut(): Promise<void>;
}
