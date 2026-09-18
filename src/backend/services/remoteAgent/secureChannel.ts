import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { fromByteArray, toByteArray } from 'base64-js';
import { getRandomBytes } from 'expo-crypto';
import nacl from 'tweetnacl';

import type { DesktopRemoteAgent } from '@/shared/data/api/schemas/desktopConnections';

export const MAX_FRAME_BYTES = 1024 * 1024;
const MAX_COUNTER = (1n << 64n) - 1n;
const encoder = new TextEncoder();
export const utf8 = (text: string) => encoder.encode(text);
export function decodeUtf8(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  // Also enforce strict UTF-8 on native decoders that do not implement `fatal`.
  if (!equal(utf8(text), bytes)) throw new Error('INVALID_UTF8');
  return text;
}
export function decodeBase64(value: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error('INVALID_BASE64');
  const bytes = toByteArray(value);
  if (fromByteArray(bytes) !== value) throw new Error('INVALID_BASE64');
  return bytes;
}
function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && (a.length === 0 || nacl.verify(a, b));
}
function concat(...values: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(values.reduce((size, value) => size + value.length, 0));
  let offset = 0;
  for (const value of values) {
    bytes.set(value, offset);
    offset += value.length;
  }
  return bytes;
}
function counterBytes(counter: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  for (let index = 7; index >= 0; index--) {
    bytes[index] = Number(counter & 255n);
    counter >>= 8n;
  }
  return bytes;
}

/** Exact Cherry v1 byte layout, with client directions (inverse of the PC). */
export class SecureChannel {
  private outgoing = 0n;
  private incoming = 0n;
  private disposed = false;
  constructor(
    private readonly sendKey: Uint8Array,
    private readonly receiveKey: Uint8Array,
    private readonly session: Uint8Array,
  ) {}
  private nonce(direction: number, counter: bigint) {
    return concat(
      this.session.slice(0, 12),
      new Uint8Array([1, direction, 0, 0]),
      counterBytes(counter),
    );
  }
  private header(direction: number, counter: bigint) {
    return concat(this.session, new Uint8Array([direction]), counterBytes(counter));
  }
  seal(value: unknown): Uint8Array {
    if (this.disposed || this.outgoing > MAX_COUNTER) throw new Error('SESSION_CLOSED');
    const bytes = utf8(JSON.stringify(value));
    if (bytes.length + 81 > MAX_FRAME_BYTES) throw new Error('FRAME_TOO_LARGE');
    const nonce = this.nonce(0, this.outgoing);
    const frame = concat(
      nonce,
      nacl.secretbox(concat(this.header(0, this.outgoing), bytes), nonce, this.sendKey),
    );
    this.outgoing++;
    return frame;
  }
  open(frame: Uint8Array): unknown {
    if (
      this.disposed ||
      this.incoming > MAX_COUNTER ||
      frame.length < 81 ||
      frame.length > MAX_FRAME_BYTES
    )
      throw new Error('INVALID_FRAME');
    const nonce = this.nonce(1, this.incoming);
    if (!equal(nonce, frame.subarray(0, 24))) throw new Error('INVALID_FRAME');
    const plain = nacl.secretbox.open(frame.subarray(24), nonce, this.receiveKey);
    if (!plain || !equal(this.header(1, this.incoming), plain.subarray(0, 41)))
      throw new Error('INVALID_FRAME');
    const value: unknown = JSON.parse(decodeUtf8(plain.subarray(41)));
    this.incoming++;
    return value;
  }
  dispose() {
    this.disposed = true;
    this.sendKey.fill(0);
    this.receiveKey.fill(0);
    this.session.fill(0);
  }
}

export function createHandshake(identity: DesktopRemoteAgent) {
  // Native Expo randomness; never fall back to Math.random or TweetNaCl's environment probe.
  const secret = getRandomBytes(32);
  const clientKey = nacl.box.keyPair.fromSecretKey(secret).publicKey;
  const clientNonce = getRandomBytes(32);
  const hello = {
    type: 'hello',
    version: 1,
    publicKey: fromByteArray(clientKey),
    nonce: fromByteArray(clientNonce),
  };
  return {
    hello,
    dispose: () => {
      secret.fill(0);
      clientNonce.fill(0);
    },
    accept(ready: { instanceId: string; publicKey: string; nonce: string }) {
      if (ready.instanceId !== identity.instanceId || ready.publicKey !== identity.serverPublicKey)
        throw new Error('IDENTITY_CHANGED');
      const serverKey = decodeBase64(ready.publicKey);
      const serverNonce = decodeBase64(ready.nonce);
      if (serverKey.length !== 32 || serverNonce.length !== 32) throw new Error('INVALID_READY');
      const raw = nacl.scalarMult(secret, serverKey);
      const invalid = raw.every((byte) => byte === 0);
      raw.fill(0);
      if (invalid) throw new Error('INVALID_READY');
      const hash = sha256(
        utf8(
          JSON.stringify([
            'cherry-remote/v1',
            identity.instanceId,
            ready.publicKey,
            hello.publicKey,
            hello.nonce,
            ready.nonce,
          ]),
        ),
      );
      const shared = nacl.box.before(serverKey, secret);
      const salt = sha256(concat(utf8('cherry-remote/v1/salt\0'), clientNonce, serverNonce));
      const expanded = hkdf(
        sha256,
        shared,
        salt,
        concat(utf8('cherry-remote/v1/session\0'), hash),
        96,
      );
      const channel = new SecureChannel(
        expanded.slice(0, 32),
        expanded.slice(32, 64),
        expanded.slice(64),
      );
      shared.fill(0);
      expanded.fill(0);
      secret.fill(0);
      return { channel, transcriptHash: fromByteArray(hash) };
    },
  };
}
