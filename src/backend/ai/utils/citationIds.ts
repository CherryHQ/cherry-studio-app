import * as Crypto from 'expo-crypto';

/** Create a per-lookup prefix so result IDs stay unique across one assistant message. */
export function newCitePrefix(): string {
  return Crypto.randomUUID().slice(0, 8);
}

export function citeId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}
