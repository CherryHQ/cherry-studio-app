/** Normalized app input; product owners validate service addresses before sending credentials. */
export type AccountSessionContext = {
  issuer: string;
  enterpriseApiBaseUrl?: string;
  cloudApiOrigin?: string;
};

export type AccountErrorCode =
  /** Cloud login cannot obtain a registration for this installation. */
  | 'unavailable'
  | 'address'
  | 'connection'
  | 'credentials'
  | 'failed'
  | 'response'
  /** The enterprise server rejected the account or organization. */
  | 'rejected';

export class AccountError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    options?: ErrorOptions,
  ) {
    super(`Account ${code}`, options);
    this.name = 'AccountError';
  }
}

/** Installation account state. Tokens and SDK objects never reach the UI. */
export type AccountState = Readonly<{
  isSignedIn: boolean;
  /** Whether this runtime serves an enterprise profile rather than local data. */
  isEnterprise: boolean;
  /** The stored session has not yet been matched to this enterprise profile. */
  isRestoringSession: boolean;
  /** The account SDK is still reading the stored session for the local profile. */
  isRestoringCommunitySession: boolean;
  /** The session was rejected, does not match this profile, or is being replaced by sign-in. */
  needsSignIn: boolean;
  /** The account entry has been completed or skipped during onboarding. */
  hasPrompted: boolean;
  isBusy: boolean;
  /** Display name; never use it as a stable identity or infer a login name from it. */
  name?: string;
  maskedIdentifier?: string;
  /** Server used when reauthenticating the current private account. */
  privateAddress?: string;
  /** Actual login name returned by the private server; never inferred from a display name or ID. */
  privateUsername?: string;
  /** The active cloud organization's display name, when Accounts Portal provided one. */
  organizationName?: string;
}>;

export function isAccountCallbackUrl(raw: string, redirectUri: string | undefined): boolean {
  try {
    const url = new URL(raw);
    url.search = '';
    url.hash = '';
    return url.href === redirectUri;
  } catch {
    return false;
  }
}

export type PrivateSignIn = { address: string; username: string; password: string };

/**
 * Sign-in, switching and sign-out. A community account, signed in or not, uses the installation's
 * own data; an enterprise or private account opens its organization's data. Changing between them
 * reloads the app.
 */
export interface AccountModule {
  getState(): AccountState;
  subscribe(listener: () => void): () => void;
  /**
   * Cloud browser sign-in, or direct password sign-in to a private deployment. Resolves true when
   * the app stays where it is: a community account signed in, or the open organization signed in
   * again. Another organization reloads the app instead.
   */
  signIn(options?: PrivateSignIn): Promise<boolean>;
  /** Opens the web space chooser using the current browser sign-in. */
  switchSpace(): Promise<boolean>;
  /** Returns null synchronously for another route. Account callbacks settle the current sign-in. */
  receiveRedirect(url: string): Promise<boolean> | null;
  /** Ends the session. An enterprise or private account returns to the community data. */
  signOut(): Promise<void>;
  /** Continues onboarding without signing in. */
  dismissPrompt(): void;
}

/** Accepts a hostname, port and optional API path; a bare hostname uses HTTPS. */
export function normalizeEnterpriseAddress(input: string): string {
  const value = input.trim();
  let url: URL;
  try {
    if (!value || value.startsWith('//') || /\s/.test(value)) throw new Error('empty');
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new AccountError('address');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new AccountError('address');
  return url.toString().replace(/\/$/, '');
}
