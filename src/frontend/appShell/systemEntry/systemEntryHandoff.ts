import { randomUUID } from 'expo-crypto';

import type { SystemEntrySession } from '@/shared/contracts';

const entries = new Map<string, SystemEntrySession>();

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
