import * as z from 'zod';

import { createHttpClient } from '@/backend/services/http';

export const NetworkRegionSchema = z.enum(['CN', 'GLOBAL']);
export type NetworkRegion = z.infer<typeof NetworkRegionSchema>;

const httpsOrigin = z
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

/** Validates and normalizes a bare HTTPS origin with no credentials, path, query, or hash. */
export function configOrigin(value: unknown): string | undefined {
  const parsed = httpsOrigin.safeParse(value);
  if (!parsed.success) return undefined;
  const url = new URL(parsed.data);
  return url.pathname === '/' ? url.origin : undefined;
}

/** Calls Config Service `POST /v1/resolve` anonymously to discover regional configuration. */
export async function requestConfigServiceResolve(
  origin: string,
  platform: string,
  options?: {
    region?: NetworkRegion;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<{ data: unknown; status: number }> {
  const http = createHttpClient({
    serviceName: 'RegionService',
    operation: 'region.resolve',
    baseUrl: origin,
    timeoutMs: options?.timeoutMs ?? 15_000,
  });
  const { data, status } = await http.request({
    method: 'POST',
    path: '/v1/resolve',
    body: {
      client: 'mobile',
      platform,
      ...(options?.region && { selected_region: options.region }),
    },
    signal: options?.signal,
    credentials: 'omit',
    redirect: 'error',
    maxResponseBytes: 32 * 1024,
  });
  return { data, status };
}
