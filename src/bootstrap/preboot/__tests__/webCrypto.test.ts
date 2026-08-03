/**
 * Emulates the Hermes runtime, which has no `crypto` global at all, then
 * loads the polyfill onto it. Node's jest environment ships a real WebCrypto
 * global, so each case rebuilds the window the polyfill acts in.
 */

jest.mock('expo-crypto', () => ({
  getRandomValues: <T extends Uint8Array>(array: T): T => array.fill(7),
  randomUUID: () => '00000000-0000-4000-8000-000000000000',
}));

type CryptoHolder = { crypto?: Crypto };

const holder = globalThis as CryptoHolder;
// Reads through a call so TypeScript cannot narrow the global away after the
// `delete` that each case starts from.
const currentCrypto = () => (globalThis as CryptoHolder).crypto;
const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

const loadPolyfill = () => {
  jest.isolateModules(() => {
    // The polyfill only acts at import time, so re-evaluating it needs a
    // require inside the isolated registry — an ESM import would be hoisted
    // out of the fake-global window this test sets up.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../webCrypto');
  });
};

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(globalThis, 'crypto', originalDescriptor);
  } else {
    delete holder.crypto;
  }
});

describe('crypto global polyfill', () => {
  it('installs getRandomValues and randomUUID when the global is absent', () => {
    delete holder.crypto;
    loadPolyfill();

    expect(typeof currentCrypto()?.getRandomValues).toBe('function');
    expect(typeof currentCrypto()?.randomUUID).toBe('function');
    expect(currentCrypto()?.getRandomValues(new Uint8Array(4))).toEqual(
      new Uint8Array([7, 7, 7, 7]),
    );
  });

  it('fills only the missing members of a partial implementation', () => {
    const nativeGetRandomValues = <T extends ArrayBufferView | null>(values: T): T => values;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues: nativeGetRandomValues },
    });
    loadPolyfill();

    expect(currentCrypto()?.getRandomValues).toBe(nativeGetRandomValues);
    expect(currentCrypto()?.randomUUID()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('leaves a complete implementation alone', () => {
    const native = {
      getRandomValues: <T extends ArrayBufferView | null>(values: T): T => values,
      randomUUID: () => 'native',
    };
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: native });
    loadPolyfill();

    expect(currentCrypto()?.getRandomValues).toBe(native.getRandomValues);
    expect(currentCrypto()?.randomUUID).toBe(native.randomUUID);
  });
});
