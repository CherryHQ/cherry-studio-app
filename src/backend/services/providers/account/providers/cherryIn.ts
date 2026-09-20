import * as z from 'zod';

import { createHttpClient } from '@/backend/services/http';
import { ProviderAccountError } from '@/shared/contracts/providerAccounts';

import type { ProviderAccountDefinition } from '../providerAccountDefinition';
import { createProviderOauthClient, getProviderOauthApplication } from '../providerOauth';

const ACCOUNT_HOST = 'https://open.cherryin.ai';
const CLIENT_ID = '2a348c87-bae1-4756-a62f-b2e97200fd6d';
const http = createHttpClient({ baseUrl: ACCOUNT_HOST, timeoutMs: 15_000 });
const key = z.string().min(1).max(16_384).regex(/^\S+$/);
const ApiKeySchema = z
  .union([key, z.object({ key }), z.object({ token: key })])
  .transform((item) => (typeof item === 'string' ? item : 'key' in item ? item.key : item.token));
const KeysResponseSchema = z.union([
  z.array(ApiKeySchema),
  z.object({ data: z.array(ApiKeySchema) }).transform(({ data }) => data),
]);
const BalanceResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ quota: z.number().finite(), used_quota: z.number().finite() }),
});
const ProfileSchema = z.object({
  display_name: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ProviderAccountError('request');
  return parsed.data;
}
async function request(path: string, token: string, signal: AbortSignal) {
  return (
    await http.request<unknown>({
      method: 'GET',
      path,
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      maxResponseBytes: 1_000_000,
      signal,
    })
  ).data;
}

export const cherryInAccountDefinition = {
  id: 'cherryin',
  getApplication: () => getProviderOauthApplication(CLIENT_ID),
  oauth: createProviderOauthClient({
    authorizationUrl: `${ACCOUNT_HOST}/oauth2/auth`,
    tokenUrl: `${ACCOUNT_HOST}/oauth2/token`,
    revokeUrl: `${ACCOUNT_HOST}/oauth2/revoke`,
    scopes: 'openid profile email offline_access balance:read usage:read tokens:read tokens:write',
  }),
  async getApiKeys(token: string, signal: AbortSignal) {
    const keys = parse(KeysResponseSchema, await request('/api/v1/oauth/tokens', token, signal));
    if (!keys.length) throw new ProviderAccountError('no-keys');
    return [...new Set(keys)];
  },
  async getBalance(token: string, signal: AbortSignal) {
    const response = parse(
      BalanceResponseSchema,
      await request('/api/v1/oauth/balance', token, signal),
    );
    return { amount: response.data.quota / 500000, currency: 'USD' };
  },
  async getProfile(token: string, signal: AbortSignal) {
    const profile = parse(
      z.union([
        z.object({ data: ProfileSchema.nullable() }).transform(({ data }) => data),
        ProfileSchema,
      ]),
      await request('/api/user/self', token, signal),
    );
    return {
      displayName: profile?.display_name ?? profile?.username ?? null,
      email: profile?.email ?? null,
    };
  },
} satisfies ProviderAccountDefinition;
