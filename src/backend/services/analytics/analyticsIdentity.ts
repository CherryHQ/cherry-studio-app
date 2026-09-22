import * as Crypto from 'expo-crypto';
import { validate as isUuid } from 'uuid';

import type { PreferenceClient } from '@/shared/data/preference';

/**
 * Whether a value can stand in as this install's analytics identity. Desktop
 * applies the same test to its own stored id before reusing it.
 */
export function isAnalyticsClientId(value: string): boolean {
  return isUuid(value);
}

/**
 * The stable per-install analytics identity, generating and storing one on first
 * use. Mirrors desktop's `getClientId()`, down to the preference key, so a
 * device that later pairs with a computer can simply take the desktop's value.
 */
export async function resolveClientId(preference: PreferenceClient): Promise<string> {
  const stored = preference.getCachedValue('app.user.id') ?? '';
  if (isAnalyticsClientId(stored)) return stored;

  const clientId = Crypto.randomUUID();
  await preference.set('app.user.id', clientId);
  return clientId;
}
