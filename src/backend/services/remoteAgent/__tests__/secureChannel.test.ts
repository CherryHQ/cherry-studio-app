import { createHash, hkdfSync } from 'node:crypto';

import { fromByteArray } from 'base64-js';
import nacl from 'tweetnacl';

import { createHandshake, decodeUtf8, SecureChannel } from '../secureChannel';

jest.mock('expo-crypto', () => ({
  getRandomBytes: (size: number) => new Uint8Array(size).fill(7),
}));

function serverFrame(key: Uint8Array, session: Uint8Array, counter: bigint, value: unknown) {
  const nonce = Buffer.alloc(24);
  nonce.set(session.subarray(0, 12));
  nonce[12] = 1;
  nonce[13] = 1;
  nonce.writeBigUInt64BE(counter, 16);
  const header = Buffer.alloc(41);
  header.set(session);
  header[32] = 1;
  header.writeBigUInt64BE(counter, 33);
  return Buffer.concat([
    nonce,
    nacl.secretbox(Buffer.concat([header, Buffer.from(JSON.stringify(value))]), nonce, key),
  ]);
}

it('agrees with the PC Node HKDF/transcript layout and client/server directions', () => {
  const server = nacl.box.keyPair.fromSecretKey(new Uint8Array(32).fill(11));
  const serverNonce = Buffer.alloc(32, 13);
  const identity = {
    protocolVersion: 1,
    instanceId: 'pc-instance',
    serverPublicKey: fromByteArray(server.publicKey),
    port: 1234,
    path: '/agent',
  };
  const handshake = createHandshake(identity);
  const ready = {
    instanceId: identity.instanceId,
    publicKey: identity.serverPublicKey,
    nonce: serverNonce.toString('base64'),
  };
  const accepted = handshake.accept(ready);
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest();
  const transcript = hash(
    Buffer.from(
      JSON.stringify([
        'cherry-remote/v1',
        identity.instanceId,
        ready.publicKey,
        handshake.hello.publicKey,
        handshake.hello.nonce,
        ready.nonce,
      ]),
    ),
  );
  const shared = nacl.box.before(
    Buffer.from(handshake.hello.publicKey, 'base64'),
    server.secretKey,
  );
  const salt = hash(
    Buffer.concat([
      Buffer.from('cherry-remote/v1/salt\0'),
      Buffer.from(handshake.hello.nonce, 'base64'),
      serverNonce,
    ]),
  );
  const keys = Buffer.from(
    hkdfSync(
      'sha256',
      shared,
      salt,
      Buffer.concat([Buffer.from('cherry-remote/v1/session\0'), transcript]),
      96,
    ),
  );
  expect(accepted.transcriptHash).toBe(transcript.toString('base64'));
  expect(
    accepted.channel.open(
      serverFrame(keys.subarray(32, 64), keys.subarray(64), 0n, {
        type: 'confirm',
        transcriptHash: accepted.transcriptHash,
      }),
    ),
  ).toEqual({ type: 'confirm', transcriptHash: accepted.transcriptHash });
  const frame = accepted.channel.seal({ type: 'auth', mode: 'device', token: 'test-token' });
  expect([...frame.subarray(12, 16)]).toEqual([1, 0, 0, 0]);
  const opened = nacl.secretbox.open(
    frame.subarray(24),
    frame.subarray(0, 24),
    keys.subarray(0, 32),
  );
  expect(opened).not.toBeNull();
  expect(Buffer.from(opened!.subarray(0, 32))).toEqual(keys.subarray(64));
  expect(opened![32]).toBe(0);
  expect(Buffer.from(opened!).readBigUInt64BE(33)).toBe(0n);
  expect(JSON.parse(Buffer.from(opened!.subarray(41)).toString())).toEqual({
    type: 'auth',
    mode: 'device',
    token: 'test-token',
  });
});

it('rejects changed identities, tampering, replay and skipped counters', () => {
  const key = new Uint8Array(32).fill(2);
  const session = new Uint8Array(32).fill(3);
  const channel = new SecureChannel(key.slice(), key.slice(), session.slice());
  const initial = serverFrame(key, session, 0n, { text: '你好🙂' });
  const changed = initial.slice();
  changed[changed.length - 1] ^= 1;
  expect(() => channel.open(changed)).toThrow();
  expect(channel.open(initial)).toEqual({ text: '你好🙂' });
  expect(() => channel.open(initial)).toThrow();
  expect(() => channel.open(serverFrame(key, session, 2n, {}))).toThrow();
  channel.dispose();
  expect(() => channel.seal({})).toThrow();
  const handshake = createHandshake({
    protocolVersion: 1,
    instanceId: 'pinned',
    serverPublicKey: fromByteArray(key),
    port: 1234,
    path: '/agent',
  });
  expect(() =>
    handshake.accept({
      instanceId: 'changed',
      publicKey: fromByteArray(key),
      nonce: fromByteArray(key),
    }),
  ).toThrow('IDENTITY_CHANGED');
  handshake.dispose();
});

it('preserves Unicode and rejects incomplete UTF-8 rather than inserting replacement text', () => {
  expect(decodeUtf8(Buffer.from('汉字🙂'))).toBe('汉字🙂');
  expect(() => decodeUtf8(new Uint8Array([0xf0, 0x9f]))).toThrow();
});
