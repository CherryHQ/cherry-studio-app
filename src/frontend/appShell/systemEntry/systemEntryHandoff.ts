import { randomUUID } from 'expo-crypto';

import type { SystemEntrySession, TranslationInput } from '@/shared/contracts';

const entries = new Map<string, SystemEntrySession>();
const translations = new Map<
  string,
  { input: TranslationInput; timeout: ReturnType<typeof setTimeout> }
>();

/** Router params contain only opaque handles. Payloads never enter URLs or saved navigation state. */
export function createSystemEntryHandoff(session: SystemEntrySession): string {
  const token = randomUUID();
  entries.set(token, session);
  void session.settled.then(() => entries.delete(token));
  return token;
}

export function getSystemEntryHandoff(token?: string): SystemEntrySession | undefined {
  return token ? entries.get(token) : undefined;
}

export function createTranslationHandoff(input: TranslationInput): string {
  const token = randomUUID();
  const timeout = setTimeout(() => translations.delete(token), 60_000);
  translations.set(token, { input, timeout });
  return token;
}

export function getTranslationHandoff(token?: string): TranslationInput | undefined {
  return token ? translations.get(token)?.input : undefined;
}

export function clearTranslationHandoff(token?: string): void {
  if (!token) return;
  const handoff = translations.get(token);
  if (handoff) clearTimeout(handoff.timeout);
  translations.delete(token);
}
