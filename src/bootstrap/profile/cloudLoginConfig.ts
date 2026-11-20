import * as z from 'zod';

import { isHttpError } from '@/backend/services/http';
import {
  configOrigin,
  NetworkRegionSchema,
  requestConfigServiceResolve,
} from '@/backend/services/region';
import { AccountError } from '@/shared/contracts/account';

export { configOrigin };

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

const registration = z.object({
  schema_version: z.literal(1),
  requires_region_selection: z.literal(false),
  region: NetworkRegionSchema,
  endpoints: z.object({
    issuer: endpoint,
    portal_url: endpoint,
    api_base_url: endpoint.optional(),
    // Separate optional community-service metadata. Enterprise URLs cannot serve cloud tokens.
    cloud_api_origin: endpoint.refine((value) => Boolean(configOrigin(value))).optional(),
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
  options?: { region: CloudLoginConfig['region']; signal: AbortSignal },
): Promise<CloudLoginConfig> {
  if (platform !== 'ios' && platform !== 'android') throw new AccountError('unavailable');
  try {
    const query = async (selected?: CloudLoginConfig['region']) => {
      const data = await readRegistration(origin, platform, selected, options?.signal);
      const result = parseCloudLogin(data, redirectUri);
      if (selected && result.region !== selected) throw new AccountError('response');
      return result;
    };
    if (options) {
      const result = await query(options.region);
      if (expectedIssuer && result.endpoints.issuer !== expectedIssuer.replace(/\/+$/, ''))
        throw new AccountError('unavailable');
      return result;
    }
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

async function readRegistration(
  origin: string,
  platform: string,
  region?: CloudLoginConfig['region'],
  signal?: AbortSignal,
) {
  const { data, status } = await requestConfigServiceResolve(origin, platform, { region, signal });
  if (status !== 200) throw new AccountError('response');
  return data;
}

/** Resolves the regional Cloud catalog origin without creating a login session. */
export async function resolvePublicCatalogOrigin(
  origin: unknown,
  platform: string,
  signal: AbortSignal,
) {
  const service = configOrigin(origin);
  if (!service || (platform !== 'ios' && platform !== 'android'))
    throw new AccountError('unavailable');
  const data = await readRegistration(service, platform, undefined, signal);
  const registration = z
    .object({
      schema_version: z.literal(1),
      requires_region_selection: z.literal(false),
      region: NetworkRegionSchema,
      endpoints: z.object({ cloud_api_origin: endpoint }),
    })
    .parse(data);
  const apiOrigin = configOrigin(registration.endpoints.cloud_api_origin);
  if (!apiOrigin) throw new AccountError('unavailable');
  return apiOrigin;
}
