import { OAuthServiceError } from './errors';
import { CHERRYIN_PROVIDER_ID, cherryInOAuthProvider } from './providers/cherryin';
import type { OAuthAuthorizeConfig, OAuthProviderContext, OAuthProviderDefinition } from './types';

/**
 * The OAuth provider registry. Adding a provider means adding one file under
 * `providers/` and one entry here — nothing in the runtime, the contracts, or
 * the settings UI needs to know its name.
 */
export const oauthProviderDefinitions = {
  [CHERRYIN_PROVIDER_ID]: cherryInOAuthProvider,
} satisfies Record<string, OAuthProviderDefinition>;

export type OAuthProviderId = keyof typeof oauthProviderDefinitions;

export function isOAuthProvider(providerId: string): providerId is OAuthProviderId {
  return providerId in oauthProviderDefinitions;
}

export function getOAuthProviderDefinition(providerId: string): OAuthProviderDefinition {
  const definition = oauthProviderDefinitions[providerId as OAuthProviderId];

  if (!definition) {
    throw new OAuthServiceError(
      `No OAuth provider is registered for ${providerId}`,
      undefined,
      'UnknownOAuthProvider',
    );
  }

  return definition;
}

/**
 * The subset the frontend needs to build an authorization request. Kept narrow
 * on purpose so UI code never reaches `afterPersistTokens`, which performs
 * network calls and belongs to the backend runtime.
 */
export function resolveAuthorizeConfig(
  providerId: string,
  context?: OAuthProviderContext,
): OAuthAuthorizeConfig {
  const definition = getOAuthProviderDefinition(providerId);

  return {
    authorizeUrl: definition.resolveEndpoints(context).authorizeUrl,
    clientId: definition.clientId,
    redirect: definition.redirect,
    scopes: definition.scopes,
  };
}
