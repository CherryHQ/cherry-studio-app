import { randomUUID } from 'expo-crypto';
import { Linking, Platform } from 'react-native';

import { UuRemoteError, type UuRemoteTarget } from '@/shared/contracts/uuRemote';

import { createUuRemoteModule } from '../createUuRemoteModule';
import type { UuRemotePending, UuRemoteStorage } from '../uuRemoteStorage';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('@/backend/utils/oauth', () => ({
  nativeCallbackUrl: (path: string) => `cherrystudio-dev://${path}`,
}));
jest.mock('../uuRemoteStorage', () => ({ uuRemoteStorage: {} }));

const target: UuRemoteTarget = {
  page: 'chat',
  connectionId: 'desktop-a',
  agentId: 'agent-a',
  sessionId: 'session-a',
};
const encryptedId = 'opaque+/= device:id';

function setup() {
  const bindings = new Map<string, string>();
  let pending: UuRemotePending | null = null;
  const storage: UuRemoteStorage = {
    readBinding: async (id) => bindings.get(id) ?? null,
    writeBinding: async (id, value) => {
      if (value === null) bindings.delete(id);
      else bindings.set(id, value);
    },
    readPending: async () => pending,
    writePending: async (value) => {
      pending = value;
    },
  };
  const connectionExists = jest.fn(async () => true);
  const create = () => createUuRemoteModule({ storage, connectionExists });
  return { ...create(), bindings, storage, create, connectionExists };
}

function lastRequest() {
  const calls = jest.mocked(Linking.openURL).mock.calls;
  return new URL(calls[calls.length - 1][0]);
}

function reply(request: URL, fields: Record<string, string>) {
  const url = new URL(request.searchParams.get('callback')!);
  const nonce = request.searchParams.get('nonce');
  if (nonce) url.searchParams.set('nonce', nonce);
  for (const [key, value] of Object.entries(fields)) url.searchParams.set(key, value);
  return url.toString();
}

beforeEach(() => {
  jest.restoreAllMocks();
  let sequence = 0;
  jest.mocked(randomUUID).mockImplementation(() => `request-${++sequence}`);
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: '18.0' });
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

test('first use asks for association before opening UU', async () => {
  const { module } = setup();
  await expect(module.open(target)).resolves.toBe('binding-required');
  expect(Linking.openURL).not.toHaveBeenCalled();
  await module.bind(target);
  const request = lastRequest();
  expect(request.pathname).toBe('/device/authorize');
  expect(request.searchParams.get('nonce')).toBeTruthy();
  expect(request.searchParams.get('callback')).toMatch(
    /^cherrystudio-dev:\/\/uu-remote\/callback\?/,
  );
  expect(request.toString()).not.toContain('desktop-a');
});

test('binding survives process replacement, preserves the return target and encodes the PiP request', async () => {
  const first = setup();
  await first.module.bind(target);
  const callback = reply(lastRequest(), { anonymous_device_id: encryptedId });
  await first.dispose();
  const second = first.create();
  await expect(second.module.receiveCallback(callback)).resolves.toEqual({
    target,
    outcome: 'bound',
  });
  expect(first.bindings.get(target.connectionId)).toBe(encryptedId);
  await expect(second.module.open(target)).resolves.toBe('opened');
  const request = lastRequest();
  expect(request.pathname).toBe('/device/control');
  expect(request.searchParams.get('anonymous_device_id')).toBe(encryptedId);
  expect(request.searchParams.get('window_type')).toBe('1');
  expect(
    new URL(request.searchParams.get('callback')!).searchParams.get('request_id'),
  ).toBeTruthy();
});

test.each(['scheme', 'path', 'request', 'nonce', 'duplicate'])(
  'ignores an uncorrelated %s callback without consuming the valid request',
  async (kind) => {
    const { module, storage, bindings } = setup();
    await module.bind(target);
    const valid = reply(lastRequest(), { anonymous_device_id: encryptedId });
    const forged = new URL(valid);
    if (kind === 'scheme') forged.protocol = 'cherrystudio:';
    if (kind === 'path') forged.pathname = '/other';
    if (kind === 'request') forged.searchParams.set('request_id', 'wrong');
    if (kind === 'nonce') forged.searchParams.set('nonce', 'wrong');
    if (kind === 'duplicate') forged.searchParams.append('request_id', 'wrong');
    await expect(module.receiveCallback(forged.toString())).resolves.toBeNull();
    expect(bindings.size).toBe(0);
    expect(await storage.readPending()).not.toBeNull();
    await expect(module.receiveCallback(valid)).resolves.toEqual({ target, outcome: 'bound' });
  },
);

test('a replaced request and a replay cannot overwrite another computer association', async () => {
  const { module, bindings } = setup();
  await module.bind(target);
  const old = reply(lastRequest(), { anonymous_device_id: 'old' });
  const next: UuRemoteTarget = { page: 'device', connectionId: 'desktop-b' };
  await module.bind(next);
  const current = reply(lastRequest(), { anonymous_device_id: 'new' });
  await expect(module.receiveCallback(old)).resolves.toBeNull();
  await expect(module.receiveCallback(current)).resolves.toEqual({
    target: next,
    outcome: 'bound',
  });
  await expect(module.receiveCallback(current)).resolves.toBeNull();
  expect([...bindings]).toEqual([['desktop-b', 'new']]);
});

test('a cancelled reassociation preserves the previous computer', async () => {
  const { module, bindings } = setup();
  bindings.set(target.connectionId, encryptedId);
  await module.bind(target);
  await expect(
    module.receiveCallback(reply(lastRequest(), { error: 'user_cancel' })),
  ).resolves.toEqual({ target, outcome: 'cancelled' });
  expect(bindings.get(target.connectionId)).toBe(encryptedId);
});

test('an expired or removed-device callback cannot create a binding', async () => {
  const { module, storage, bindings, connectionExists } = setup();
  await module.bind(target);
  const expired = reply(lastRequest(), { anonymous_device_id: encryptedId });
  await storage.writePending({
    ...(await storage.readPending())!,
    createdAt: Date.now() - 31 * 60 * 1000,
  });
  await expect(module.receiveCallback(expired)).resolves.toMatchObject({
    outcome: 'failed',
    reason: 'timeout',
  });
  await module.bind(target);
  connectionExists.mockResolvedValue(false);
  await expect(
    module.receiveCallback(reply(lastRequest(), { anonymous_device_id: encryptedId })),
  ).resolves.toBeNull();
  expect(bindings.size).toBe(0);
});

test('invalid device errors remove only that binding so the next press can associate again', async () => {
  const { module, bindings } = setup();
  bindings.set('desktop-a', encryptedId);
  bindings.set('desktop-b', 'other');
  await module.open(target);
  await expect(
    module.receiveCallback(reply(lastRequest(), { status: 'failure', reason: 'device_not_found' })),
  ).resolves.toEqual({ target, outcome: 'failed', reason: 'binding-invalid' });
  expect([...bindings]).toEqual([['desktop-b', 'other']]);
  await expect(module.open(target)).resolves.toBe('binding-required');
});

test.each([
  ['pip_unsupported', 'pip-unsupported'],
  ['device_offline', 'device-offline'],
  ['busy', 'busy'],
  ['network_unavailable', 'network'],
  ['not_allowed', 'not-allowed'],
  ['connect_timeout', 'timeout'],
  ['login_timeout', 'login'],
  ['unknown', 'failed'],
  ['constructor', 'failed'],
])('maps %s to product feedback while retaining the binding', async (reason, expected) => {
  const { module, bindings } = setup();
  bindings.set(target.connectionId, encryptedId);
  await module.open(target);
  await expect(
    module.receiveCallback(reply(lastRequest(), { status: 'failure', reason })),
  ).resolves.toEqual({ target, outcome: 'failed', reason: expected });
  expect(bindings.get(target.connectionId)).toBe(encryptedId);
});

test('PiP success is a one-shot result, and contradictory binding responses are rejected', async () => {
  const { module, bindings } = setup();
  bindings.set(target.connectionId, encryptedId);
  await module.open(target);
  const callback = reply(lastRequest(), { status: 'success' });
  await expect(module.receiveCallback(callback)).resolves.toEqual({ target, outcome: 'opened' });
  await expect(module.receiveCallback(callback)).resolves.toBeNull();
  await module.bind(target);
  await expect(
    module.receiveCallback(
      reply(lastRequest(), { anonymous_device_id: 'untrusted', error: 'user_cancel' }),
    ),
  ).resolves.toMatchObject({ outcome: 'failed' });
  expect(bindings.get(target.connectionId)).toBe(encryptedId);
});

test('missing installation and unsupported iOS do not leave a pending handoff', async () => {
  const { module, storage } = setup();
  jest.mocked(Linking.canOpenURL).mockResolvedValue(false);
  await expect(module.bind(target)).rejects.toEqual(new UuRemoteError('not-installed'));
  Object.defineProperty(Platform, 'Version', { configurable: true, value: '17.6' });
  await expect(module.open(target)).rejects.toEqual(new UuRemoteError('pip-unsupported'));
  expect(await storage.readPending()).toBeNull();
  expect(Linking.openURL).not.toHaveBeenCalled();
});

test('Android uses the same PiP protocol without applying the iOS version gate', async () => {
  const { module, bindings } = setup();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  Object.defineProperty(Platform, 'Version', { configurable: true, value: 26 });
  bindings.set(target.connectionId, encryptedId);
  await expect(module.open(target)).resolves.toBe('opened');
  expect(lastRequest().searchParams.get('window_type')).toBe('1');
});

test('failed launches clear the request, and disposed owners cannot launch', async () => {
  const { module, storage, dispose } = setup();
  jest.mocked(Linking.openURL).mockRejectedValue(new Error('native failure'));
  await expect(module.bind(target)).rejects.toEqual(new UuRemoteError('failed'));
  expect(await storage.readPending()).toBeNull();
  await dispose();
  jest.mocked(Linking.openURL).mockClear();
  await expect(module.bind(target)).rejects.toEqual(new UuRemoteError('failed'));
  expect(Linking.openURL).not.toHaveBeenCalled();
});
