import * as z from 'zod';

import { createHttpClient } from '@/backend/services/http';
import { AccountError } from '@/shared/contracts/account';

export const PrivateUserSchema = z.object({
  id: z.union([z.string().min(1), z.number()]).transform(String),
  username: z.string().nullish(),
});

export const PrivateCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable(),
  serverUniqueId: z.string().min(1),
  user: PrivateUserSchema,
});
export type PrivateCredentials = z.infer<typeof PrivateCredentialsSchema>;

const TokenResponseSchema = z.object({
  accessToken: z.string().min(1).optional(),
  access_token: z.string().min(1).optional(),
  refreshToken: z.string().nullish(),
  refresh_token: z.string().nullish(),
  serverUniqueId: z.string().nullish(),
  server_unique_id: z.string().nullish(),
  user: PrivateUserSchema,
});

/** The v2 private deployment's password exchanges; credentials never leave this service route. */
export function createPrivateAccountApi(baseUrl: string) {
  const client = createHttpClient({ baseUrl, timeoutMs: 20_000 });
  const exchange = async (path: string, body: Record<string, string>) => {
    const response = await client.request<unknown>({
      method: 'POST',
      path,
      body,
      credentials: 'omit',
      redirect: 'error',
      maxResponseBytes: 1024 * 1024,
    });
    const parsed = TokenResponseSchema.safeParse(response.data);
    if (!parsed.success) throw new AccountError('connection');
    const value = parsed.data;
    const accessToken = value.accessToken ?? value.access_token;
    if (!accessToken) throw new AccountError('connection');
    return {
      accessToken,
      refreshToken: value.refreshToken ?? value.refresh_token ?? null,
      serverUniqueId: value.serverUniqueId ?? value.server_unique_id ?? null,
      user: value.user,
    };
  };
  return {
    signIn: (username: string, password: string) => exchange('/auth/login', { username, password }),
    refresh: (refreshToken: string) => exchange('/auth/refresh', { refreshToken }),
  };
}
