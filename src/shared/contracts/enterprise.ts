export type EnterpriseErrorCode =
  /** The build carries no Accounts Portal configuration. */
  | 'unavailable'
  | 'address'
  /** The chosen Accounts Portal profile is not an enterprise organization. */
  | 'unsupported-profile'
  | 'connection'
  /** The enterprise server rejected the account or organization. */
  | 'rejected';

export class EnterpriseError extends Error {
  constructor(readonly code: EnterpriseErrorCode) {
    super(`Enterprise ${code}`);
    this.name = 'EnterpriseError';
  }
}

/** Installation account state. Tokens and SDK objects never reach the UI. */
export type EnterpriseAccountState = Readonly<{
  isAvailable: boolean;
  /** Whether this runtime serves an enterprise profile rather than local data. */
  isEnterprise: boolean;
  /** The server no longer accepts this enterprise session; data stays readable offline. */
  needsSignIn: boolean;
  isBusy: boolean;
  name?: string;
  /** Enterprise service address used for sign-in and synchronization. */
  address: string;
}>;

/** Sign-in, sign-out and local mode each select a profile and reload the app. */
export interface EnterpriseModule {
  getState(): EnterpriseAccountState;
  subscribe(listener: () => void): () => void;
  /** Browser sign-in; the portal also lets the user pick another organization. */
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Opens local data and keeps the account signed in. */
  useLocal(): Promise<void>;
  setAddress(address: string): void;
}

/** Accepts a hostname, port and optional API path; a bare hostname uses HTTPS. */
export function normalizeEnterpriseAddress(input: string): string {
  const value = input.trim();
  let url: URL;
  try {
    if (!value || value.startsWith('//') || /\s/.test(value)) throw new Error('empty');
    url = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new EnterpriseError('address');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new EnterpriseError('address');
  return url.toString().replace(/\/$/, '');
}
