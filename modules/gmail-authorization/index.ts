import { requireOptionalNativeModule } from 'expo';

export type GmailNativeAuthorization = {
  accessToken: string;
  grantedScopes: string[];
};

export type GmailAuthorizationModule = {
  /** Only an explicit connection action may present account or consent UI. */
  authorize(accountEmail: string | null, interactive: boolean): Promise<GmailNativeAuthorization>;
  revoke(accountEmail: string): Promise<void>;
  clearToken(accessToken: string): Promise<void>;
};

export function getGmailAuthorization(): GmailAuthorizationModule | null {
  return requireOptionalNativeModule<GmailAuthorizationModule>('GmailAuthorization');
}
