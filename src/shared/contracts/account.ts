export type AccountErrorCode =
  /** The build carries no Accounts Portal configuration. */
  | 'unavailable'
  | 'address'
  | 'connection'
  | 'credentials'
  /** The enterprise server rejected the account or organization. */
  | 'rejected';

export class AccountError extends Error {
  constructor(readonly code: AccountErrorCode) {
    super(`Account ${code}`);
    this.name = 'AccountError';
  }
}

/** Installation account state. Tokens and SDK objects never reach the UI. */
export type AccountState = Readonly<{
  /** Whether the build supports cloud sign-in. Private sign-in needs no portal configuration. */
  isAvailable: boolean;
  isSignedIn: boolean;
  /** Whether this runtime serves an enterprise profile rather than local data. */
  isEnterprise: boolean;
  /** The enterprise server no longer accepts this session; the user must sign in again. */
  needsSignIn: boolean;
  /** A new installation has seen the sign-in page, whether it signed in or not. */
  hasPrompted: boolean;
  isBusy: boolean;
  name?: string;
  /** Preselects private sign-in when restoring or switching a private account. */
  privateAddress?: string;
}>;

export type PrivateSignIn = { address: string; username: string; password: string };

/**
 * Account sign-in. A community profile opens local data; an enterprise profile opens its
 * own data. Switching between them reloads the app.
 */
export interface AccountModule {
  getState(): AccountState;
  subscribe(listener: () => void): () => void;
  /**
   * Cloud browser sign-in, or direct password sign-in to a private deployment. Resolves true when a
   * community account signed in; an enterprise account reloads the app instead.
   */
  signIn(options?: PrivateSignIn): Promise<boolean>;
  signOut(): Promise<void>;
  /** Opens local data and keeps the account signed in. */
  useLocal(): Promise<void>;
  /** Continues a new installation without signing in. */
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
