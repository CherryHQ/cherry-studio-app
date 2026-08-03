/**
 * Global `crypto` polyfill for the `uuid` package.
 *
 * Desktop generates row ids with `uuid`, whose browser build reads the bare
 * `crypto` global (`crypto.getRandomValues` in its rng, `crypto.randomUUID`
 * in v4). Node and Electron provide that global; Hermes does not, and Expo's
 * winter runtime does not install one either, so the first Drizzle insert
 * that runs a `$defaultFn(() => uuidv4())` column default dies with
 * "Property 'crypto' doesn't exist" during database seeding on a fresh
 * install. expo-crypto's native module supplies both primitives
 * synchronously.
 */

import { getRandomValues, randomUUID } from 'expo-crypto';

type WebCryptoSubset = {
  getRandomValues: typeof getRandomValues;
  randomUUID: typeof randomUUID;
};

const holder = globalThis as { crypto?: Partial<WebCryptoSubset> };

if (!holder.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { getRandomValues, randomUUID } satisfies WebCryptoSubset,
  });
} else {
  // A future Hermes or winter runtime may ship a partial implementation;
  // fill only what is missing and leave native members untouched.
  if (typeof holder.crypto.getRandomValues !== 'function') {
    holder.crypto.getRandomValues = getRandomValues;
  }
  if (typeof holder.crypto.randomUUID !== 'function') {
    holder.crypto.randomUUID = randomUUID;
  }
}
