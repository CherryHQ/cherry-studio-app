import * as z from 'zod';

import { OAuthServiceError } from '@/shared/oauth';
import type { OAuthProviderContext } from '@/shared/oauth';

export const CHERRYIN_PROVIDER_ID = 'cherryin';

export const CHERRYIN_CONFIG = {
  ALLOWED_HOSTS: ['https://open.cherryin.ai', 'https://open.cherryin.dev'],
  CLIENT_ID: '2a348c87-bae1-4756-a62f-b2e97200fd6d',
  REDIRECT: { path: 'oauth/callback', scheme: 'cherrystudio' },
  SCOPES: 'openid profile email offline_access balance:read usage:read tokens:read tokens:write',
} as const;

const ApiKeyItemSchema = z
  .union([z.string(), z.object({ key: z.string() }), z.object({ token: z.string() })])
  .transform((item): string => {
    if (typeof item === 'string') return item;
    return 'key' in item ? item.key : item.token;
  });

export const ApiKeysResponseSchema = z
  .union([z.array(ApiKeyItemSchema), z.object({ data: z.array(ApiKeyItemSchema) })])
  .transform((data): string[] => (Array.isArray(data) ? data : data.data));

export function validateCherryInApiHost(apiHost: string): void {
  if (!(CHERRYIN_CONFIG.ALLOWED_HOSTS as readonly string[]).includes(apiHost)) {
    throw new OAuthServiceError(`Unauthorized API host: ${apiHost}`, undefined, 'InvalidHost');
  }
}

export function resolveCherryInContext(context?: OAuthProviderContext): {
  apiHost: string;
  oauthServer: string;
} {
  const oauthServer = context?.oauthServer ?? CHERRYIN_CONFIG.ALLOWED_HOSTS[0];
  validateCherryInApiHost(oauthServer);

  const apiHost = context?.apiHost ?? oauthServer;
  validateCherryInApiHost(apiHost);

  return { apiHost, oauthServer };
}
