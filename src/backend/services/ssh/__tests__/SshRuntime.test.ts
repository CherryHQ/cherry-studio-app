import { randomUUID as mockRandomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import * as SecureStore from 'expo-secure-store';

import { createTestDb, type TestDb } from '@/backend/data/services/__tests__/_testDb';
import { SshProfileService } from '@/backend/data/services/SshProfileService';
import type { SaveSshProfile, SshProfile } from '@/shared/data/types/ssh';

import { getSshNative, type SshNative } from '../../../../../modules/ssh';
import { SshRuntime } from '../SshRuntime';

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));
jest.mock('expo-crypto', () => ({ randomUUID: mockRandomUUID }));
jest.mock('../../../../../modules/ssh', () => ({ getSshNative: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const input: SaveSshProfile = {
  profile: {
    name: 'Router',
    host: 'router.local',
    port: 22,
    username: 'admin',
    authMethod: 'password',
  },
  credential: { authMethod: 'password', password: 'test-only-secret' },
};
const fingerprint = 'SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDE12';
const outcome = (state: string, error = '') =>
  JSON.stringify({
    state,
    error,
    fingerprint,
    stdout: '',
    stderr: '',
    exitCode: null,
    truncated: false,
  });
let db: TestDb;
let runtime: SshRuntime;
let secrets: Map<string, string>;
const native: jest.Mocked<SshNative> = {
  prepare: jest.fn(),
  cancel: jest.fn(),
  run: jest.fn(),
  addListener: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  secrets = new Map();
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    secrets.set(key, value);
  });
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => secrets.get(key) ?? null);
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    secrets.delete(key);
  });
  jest.mocked(getSshNative).mockReturnValue(native);
  native.prepare.mockReturnValue(true);
  native.addListener.mockReturnValue({ remove: jest.fn() });
  native.run.mockImplementation(async (_id, options) =>
    outcome(options.probe ? 'probed' : 'unknown'),
  );
  db = createTestDb(new DatabaseSync(':memory:'));
  runtime = new SshRuntime(db.dbService, { acquire: () => ({ release() {} }) });
});
afterEach(async () => {
  await runtime._doStop();
  db.sqlite.close();
  jest.restoreAllMocks();
});

async function trusted(): Promise<SshProfile> {
  const profile = await runtime.save(input);
  const probe = await runtime.probe(profile, new AbortController().signal);
  return runtime.trust(probe.token);
}

test('saves only a credential reference in SQLite and never authenticates a host probe', async () => {
  const profile = await runtime.save(input);
  expect(JSON.stringify(db.sqlite.prepare('SELECT * FROM ssh_profile').all())).not.toContain(
    'test-only-secret',
  );
  expect(await new SshProfileService(db.dbService).list()).toEqual([profile]);
  await expect(
    runtime.execute(profile, 'uname -a', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'host-key' });
  expect(native.run).not.toHaveBeenCalled();
  await runtime.probe(profile, new AbortController().signal);
  expect(native.run.mock.calls[0]![1]).toEqual({
    host: 'router.local',
    port: 22,
    probe: true,
    timeoutMs: 20000,
  });
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
});

test('rejects invented trust tokens and a probe whose configuration changed', async () => {
  await expect(runtime.trust(mockRandomUUID())).rejects.toMatchObject({ code: 'changed' });
  const profile = await runtime.save(input);
  const probe = await runtime.probe(profile, new AbortController().signal);
  await runtime.save({ profile: { ...input.profile, host: 'different.local' }, previous: profile });
  await expect(runtime.trust(probe.token)).rejects.toMatchObject({ code: 'changed' });
});

test('rolls back a replacement secret if the database commit fails', async () => {
  const profile = await runtime.save(input);
  const oldSecrets = new Map(secrets);
  db.failWriteTxCommit(new Error('disk full'));
  await expect(
    runtime.save({
      ...input,
      previous: profile,
      credential: { authMethod: 'password', password: 'replacement' },
    }),
  ).rejects.toMatchObject({ code: 'storage' });
  expect(secrets).toEqual(oldSecrets);
  expect(await new SshProfileService(db.dbService).list()).toEqual([profile]);
});

test('invalidates a frozen AI target when its profile changes', async () => {
  const profile = await trusted();
  await runtime.selectTarget('conversation', profile);
  await runtime.setCommandGrant('conversation', runtime.getTarget('conversation')!, true);
  const target = (await runtime.resolveAgentTarget('conversation'))!;
  await runtime.save({ profile: input.profile, previous: profile });
  expect(runtime.getTarget('conversation')).toBeNull();
  native.run.mockClear();
  await expect(
    runtime.executeForAgent('conversation', target, 'echo changed', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'changed' });
  expect(native.run).not.toHaveBeenCalled();
});

test('rechecks grant expiry after an asynchronous credential read', async () => {
  const profile = await trusted();
  await runtime.selectTarget('conversation', profile);
  await runtime.setCommandGrant('conversation', runtime.getTarget('conversation')!, true);
  const target = (await runtime.resolveAgentTarget('conversation'))!;
  let read!: () => void;
  const reading = new Promise<void>((resolve) => {
    read = resolve;
  });
  let release!: (value: string) => void;
  const secret = new Promise<string>((resolve) => {
    release = resolve;
  });
  jest.mocked(SecureStore.getItemAsync).mockImplementationOnce(() => {
    read();
    return secret;
  });
  native.run.mockClear();
  const execution = runtime.executeForAgent(
    'conversation',
    target,
    'echo expired',
    new AbortController().signal,
  );
  await reading;
  jest.spyOn(Date, 'now').mockReturnValue(target.grant!.expiresAt + 1);
  release(JSON.stringify(input.credential));
  await expect(execution).rejects.toMatchObject({ code: 'changed' });
  expect(native.run).not.toHaveBeenCalled();
});

test('revocation cancels an admitted command without replaying it or claiming it never ran', async () => {
  const profile = await trusted();
  await runtime.selectTarget('conversation', profile);
  const target = (await runtime.resolveAgentTarget('conversation'))!;
  let started!: () => void;
  const starting = new Promise<void>((resolve) => {
    started = resolve;
  });
  let complete!: (value: string) => void;
  native.run.mockClear();
  native.run.mockImplementation(() => {
    started();
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  native.cancel.mockImplementation(() => complete(outcome('unknown', 'cancelled')));
  const execution = runtime.executeForAgent(
    'conversation',
    target,
    'reboot',
    new AbortController().signal,
  );
  await starting;
  await runtime.selectTarget('conversation', null);
  await expect(execution).resolves.toMatchObject({
    state: 'unknown',
    error: 'cancelled',
    exitCode: null,
  });
  expect(native.run).toHaveBeenCalledTimes(1);
});

test('reselecting the same host does not revive an old command or grant confirmation', async () => {
  const profile = await trusted();
  await runtime.selectTarget('conversation', profile);
  const previous = runtime.getTarget('conversation')!;
  await runtime.selectTarget('conversation', null);
  await runtime.selectTarget('conversation', profile);
  native.run.mockClear();
  await expect(
    runtime.executeForAgent('conversation', previous, 'reboot', new AbortController().signal),
  ).rejects.toMatchObject({ code: 'changed' });
  await expect(runtime.setCommandGrant('conversation', previous, true)).rejects.toMatchObject({
    code: 'changed',
  });
  expect(runtime.getTarget('conversation')?.grant).toBeNull();
  expect(native.run).not.toHaveBeenCalled();
});

test('a new conversation receives its draft target without retaining a discarded draft', async () => {
  const profile = await trusted();
  const draftId = mockRandomUUID();
  const sessionId = mockRandomUUID();
  await runtime.selectTarget(`draft:${draftId}`, profile);
  await runtime.attachDraftTarget(draftId, sessionId);
  await runtime.selectTarget(`draft:${draftId}`, null);
  expect(runtime.getTarget(`draft:${draftId}`)).toBeNull();
  expect((await runtime.resolveAgentTarget(sessionId))?.profile).toEqual(profile);
});

test.each(['lease', 'subscription'] as const)(
  'releases the prepared native slot if %s setup fails',
  async (failure) => {
    const profile = await trusted();
    const release = jest.fn();
    await runtime._doStop();
    runtime = new SshRuntime(db.dbService, {
      acquire: () => {
        if (failure === 'lease') throw new Error('lease unavailable');
        return { release };
      },
    });
    if (failure === 'subscription')
      native.addListener.mockImplementationOnce(() => {
        throw new Error('bridge detached');
      });
    native.prepare.mockClear();
    native.run.mockClear();
    native.cancel.mockClear();
    await expect(
      runtime.execute(profile, 'reboot', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'unavailable' });
    expect(native.cancel).toHaveBeenCalledWith(native.prepare.mock.calls[0]![0]);
    expect(native.run).not.toHaveBeenCalled();
    expect(runtime.hasPendingStorageWork()).toBe(false);
    expect(release).toHaveBeenCalledTimes(failure === 'subscription' ? 1 : 0);
  },
);
