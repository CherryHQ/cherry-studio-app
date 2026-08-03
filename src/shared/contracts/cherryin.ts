export type CherryInProfile = {
  displayName: string | null;
  email: string | null;
  group: string | null;
  username: string | null;
};

export type CherryInAccount = {
  balance: number;
  monthlySpend: number | null;
  monthlyUsageTokens: number | null;
  profile: CherryInProfile | null;
};

/**
 * CherryIN account reporting. Kept separate from `OAuthModule` because balance
 * and profile are this provider's own REST surface, not part of OAuth.
 */
export interface CherryInModule {
  /** Defaults to CherryIN's primary host; only a multi-environment caller passes one. */
  getBalance(apiHost?: string): Promise<CherryInAccount | null>;
}
