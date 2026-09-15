import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as z from 'zod';

import { ProviderAccountError } from '@/shared/contracts';

import { ProviderOauthApplicationSchema, ProviderOauthTokensSchema } from './providerOauth';

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const PENDING_KEY = 'provider-authorization-pending';
const KeySchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string().optional(),
  isEnabled: z.boolean(),
});

export const StoredProviderAccountSchema = z.object({
  definitionId: z.string().min(1),
  application: ProviderOauthApplicationSchema,
  tokens: ProviderOauthTokensSchema,
  providerCreatedAt: z.number(),
  ownedKeys: z.array(KeySchema),
  authorized: z.boolean(),
  balance: z
    .object({ amount: z.number().finite(), currency: z.string().regex(/^[A-Z]{3}$/) })
    .nullable(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  updatedAt: z.number().nullable(),
});
export type StoredProviderAccount = z.infer<typeof StoredProviderAccountSchema>;

const PendingSchema = z.object({
  definitionId: z.string().min(1),
  application: ProviderOauthApplicationSchema,
  state: z.string(),
  verifier: z.string(),
  providerId: z.string(),
  providerCreatedAt: z.number(),
  expiresAt: z.number(),
});
export type PendingProviderAuthorization = z.infer<typeof PendingSchema>;

async function accountKey(providerId: string) {
  return `provider-account.${await digestStringAsync(CryptoDigestAlgorithm.SHA256, providerId)}`;
}

async function read<T>(key: string, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const value = await SecureStore.getItemAsync(key, OPTIONS);
    return value ? schema.parse(JSON.parse(value)) : null;
  } catch {
    throw new ProviderAccountError('storage');
  }
}

async function write(key: string, value: unknown) {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key, OPTIONS);
    else await SecureStore.setItemAsync(key, JSON.stringify(value), OPTIONS);
  } catch {
    throw new ProviderAccountError('storage');
  }
}

export const providerAccountStorage = {
  async readAccount(providerId: string) {
    return read(await accountKey(providerId), StoredProviderAccountSchema);
  },
  async writeAccount(providerId: string, account: StoredProviderAccount | null) {
    await write(await accountKey(providerId), account);
  },
  readPending: () => read(PENDING_KEY, PendingSchema),
  writePending: (pending: PendingProviderAuthorization | null) => write(PENDING_KEY, pending),
};
