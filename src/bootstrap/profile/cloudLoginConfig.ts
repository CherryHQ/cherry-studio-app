import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { AccountError } from '@/shared/contracts/account';

// These scopes are always requested by Accounts Portal 0.2.1.
export const sdkScopes = ['openid', 'profile', 'offline_access'];

const endpoint = z
  .url({ protocol: /^https$/ })
  .refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password && !url.search && !url.hash;
    } catch {
      return false;
    }
  })
  .transform((value) => value.replace(/\/+$/, ''));

export function configOrigin(value: unknown): string | undefined {
  const parsed = endpoint.safeParse(value);
  if (!parsed.success) return undefined;
  const url = new URL(parsed.data);
  return url.pathname === '/' ? url.origin : undefined;
}

const registration = z.object({
  schema_version: z.literal(1),
  requires_region_selection: z.literal(false),
  region: z.enum(['CN', 'GLOBAL']),
  endpoints: z.object({
    issuer: endpoint,
    portal_url: endpoint,
    api_base_url: endpoint.optional(),
    // Separate optional community-service metadata. Enterprise URLs cannot serve cloud tokens.
    cloud_api_origin: endpoint.refine((value) => Boolean(configOrigin(value))).optional(),
    cloud_web_url: endpoint.optional(),
  }),
  oidc_client_id: z.string().trim().min(1),
  redirect_uri: z.string(),
  scopes: z.array(z.string().min(1)).refine((values) => sdkScopes.every((s) => values.includes(s))),
});

export type CloudLoginConfig = z.infer<typeof registration>;

export function parseCloudLogin(value: unknown, redirectUri: string): CloudLoginConfig {
  const parsed = registration.safeParse(value);
  if (!parsed.success || parsed.data.redirect_uri !== redirectUri)
    throw new AccountError('response');
  return parsed.data;
}

export async function resolveCloudLogin(
  origin: string,
  platform: string,
  redirectUri: string,
  expectedIssuer?: string,
): Promise<CloudLoginConfig> {
  if (platform !== 'ios' && platform !== 'android') throw new AccountError('unavailable');
  const http = createHttpClient({ baseUrl: origin, timeoutMs: 15_000 });
  try {
    const query = async (selected?: CloudLoginConfig['region']) => {
      const { data, status } = await http.request({
        method: 'POST',
        path: '/v1/resolve',
        body: { client: 'mobile', platform, ...(selected && { selected_region: selected }) },
        credentials: 'omit',
        redirect: 'error',
        maxResponseBytes: 32 * 1024,
      });
      if (status !== 200) throw new AccountError('response');
      const result = parseCloudLogin(data, redirectUri);
      if (selected && result.region !== selected) throw new AccountError('response');
      return result;
    };
    if (!expectedIssuer) return await query();
    // A pre-discovery enterprise profile only knows its issuer. Find its actual registration
    // without letting today's network select a different identity provider.
    for (const region of ['CN', 'GLOBAL'] as const) {
      try {
        const match = await query(region);
        if (match.endpoints.issuer === expectedIssuer.replace(/\/+$/, '')) return match;
      } catch (error) {
        if (!isHttpError(error) || error.status !== 503) throw error;
      }
    }
    throw new AccountError('unavailable');
  } catch (error) {
    if (!isHttpError(error)) throw error;
    throw new AccountError(
      error.status === 503
        ? 'unavailable'
        : error.kind === 'network' || error.kind === 'timeout'
          ? 'connection'
          : 'response',
      { cause: error },
    );
  }
}
