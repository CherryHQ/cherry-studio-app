import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  closeDevice,
  deleteDevice,
  processGroupRunning,
  sameProcess,
  worktrees,
} from '../agentEnvironment/host';
import { reconcile, release } from '../agentEnvironment/pool';
import {
  assertLease,
  collectableDevice,
  readState,
  saveState,
  selectDevice,
  StateSchema,
  workspaceStatus,
  type Device,
  type State,
} from '../agentEnvironment/state';

jest.mock('../agentEnvironment/host', () => ({
  closeDevice: jest.fn(),
  deleteDevice: jest.fn(),
  processGroupRunning: jest.fn(),
  sameProcess: jest.fn(),
  worktrees: jest.fn(),
}));

let directory: string;
const now = '2026-09-29T00:00:00.000Z';
function state(): State {
  return StateSchema.parse({
    version: 1,
    repository: '/repo/.git',
    workspaces: [],
    devices: [],
    artifacts: [],
    baselines: {},
    processes: [],
    provisioning: [],
  });
}
function device(overrides: Partial<Device> = {}): Device {
  return {
    key: 'ff12fb34-3333-4333-8333-0123456789ab',
    platform: 'ios',
    id: 'sim-id',
    name: 'Cherry Shared',
    role: 'shared',
    disposable: false,
    workspaces: ['workspace-a'],
    lastUsedAt: now,
    ...overrides,
  };
}
function context() {
  return {
    cwd: '/workspace-a',
    root: '/repo',
    common: '/repo/.git',
    directory,
    workspace: {
      id: 'workspace-a',
      path: '/workspace-a',
      gitDir: '/repo/.git/worktrees/a',
      archived: false,
    },
  };
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'agent-environment-'));
  jest.resetAllMocks();
  jest.mocked(worktrees).mockReturnValue(['/workspace-a']);
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('workspace retirement evidence', () => {
  const workspace = {
    id: 'a',
    path: '/workspace-a',
    gitDir: '/repo/.git/worktrees/a',
    archived: false,
  };
  test('a listed worktree remains active even with an expired or missing auxiliary record', () => {
    expect(workspaceStatus(workspace, ['/workspace-a'], false)).toBe('active');
  });
  test('an unlisted path with a surviving Git admin directory is unknown, not retired', () => {
    expect(workspaceStatus(workspace, [], true)).toBe('unknown');
  });
  test('removed worktree and removed admin directory establish retirement', () => {
    expect(workspaceStatus(workspace, [], false)).toBe('retired');
  });
  test('an explicit archive signal works before Conductor removes the directory', () => {
    expect(workspaceStatus({ ...workspace, archived: true }, ['/workspace-a'], true)).toBe(
      'retired',
    );
  });
});

describe('shared pool admission', () => {
  test('unchanged native inputs select the common device even when its installed binary is old', () => {
    const s = state();
    s.baselines.ios = { commit: 'main', fingerprint: 'new-native' };
    const shared = device({ fingerprint: 'old-native' });
    s.devices.push(shared);
    expect(selectDevice(s, 'ios', 'new-native')).toBe(shared);
  });
  test('a native branch reuses only its matching dedicated device, never the primary', () => {
    const s = state();
    s.baselines.ios = { commit: 'main', fingerprint: 'main-native' };
    const native = device({
      id: 'native',
      role: 'native',
      fingerprint: 'branch-native',
      disposable: true,
    });
    s.devices.push(device({ role: 'primary', fingerprint: 'branch-native' }), native);
    expect(selectDevice(s, 'ios', 'branch-native')).toBe(native);
    expect(selectDevice(s, 'ios', 'different-native')).toBeUndefined();
  });
  test('two agent sessions in the same workspace cannot share a device concurrently', () => {
    const d = device({
      lease: { workspaceId: 'workspace-a', session: 'agent-1', acquiredAt: now },
    });
    expect(() => assertLease(d, 'workspace-a', 'agent-1')).not.toThrow();
    expect(() => assertLease(d, 'workspace-a', 'agent-2')).toThrow('busy');
    expect(() => assertLease(d, 'workspace-b', 'agent-1')).toThrow('busy');
    expect(() => assertLease(device({ role: 'primary' }), 'workspace-a', 'agent-1')).toThrow(
      'Primary',
    );
  });
});

describe('cleanup authorization and retry', () => {
  test('primary/shared devices and unadopted native devices never become deletable', () => {
    const retired = new Set(['workspace-a']);
    expect(collectableDevice(device(), retired)).toBe(false);
    expect(collectableDevice(device({ role: 'primary' }), retired)).toBe(false);
    expect(collectableDevice(device({ role: 'native', disposable: false }), retired)).toBe(false);
    expect(
      collectableDevice(device({ role: 'native', disposable: true, workspaces: [] }), retired),
    ).toBe(false);
  });
  test('a second live consumer or lease prevents dedicated device deletion', () => {
    const d = device({
      role: 'native',
      disposable: true,
      workspaces: ['workspace-a', 'workspace-b'],
    });
    expect(collectableDevice(d, new Set(['workspace-a']))).toBe(false);
    expect(collectableDevice(d, new Set(d.workspaces))).toBe(true);
    d.lease = { workspaceId: 'workspace-b', session: 'active', acquiredAt: now };
    expect(collectableDevice(d, new Set(d.workspaces))).toBe(false);
  });
  test('failed shutdown retains the claim and reports a blocker', async () => {
    const s = state();
    s.devices.push(
      device({ lease: { workspaceId: 'workspace-a', session: 'task', acquiredAt: now } }),
    );
    jest.mocked(closeDevice).mockImplementation(() => {
      throw new Error('foreign session');
    });
    expect(await release(context(), s, 'workspace-a', 'task')).toEqual(['foreign session']);
    expect(s.devices[0].lease?.session).toBe('task');
  });
  test('a failed deletion keeps the durable record, and a later successful retry removes it', async () => {
    const s = state();
    s.workspaces.push({ ...context().workspace, archived: true });
    s.devices.push(device({ role: 'native', disposable: true }));
    jest.mocked(deleteDevice).mockImplementationOnce(() => {
      throw new Error('identity mismatch');
    });
    expect((await reconcile(context(), s)).warnings).toEqual(['identity mismatch']);
    expect(s.devices).toHaveLength(1);
    expect((await reconcile(context(), s)).warnings).toEqual([]);
    expect(s.devices).toHaveLength(0);
    await reconcile(context(), s);
    expect(deleteDevice).toHaveBeenCalledTimes(2);
  });
  test('worktree inventory failure aborts cleanup without touching devices', async () => {
    jest.mocked(worktrees).mockImplementation(() => {
      throw new Error('git unavailable');
    });
    await expect(reconcile(context(), state())).rejects.toThrow('git unavailable');
    expect(closeDevice).not.toHaveBeenCalled();
    expect(deleteDevice).not.toHaveBeenCalled();
  });
  test('a surviving process group is retained when its original leader is gone', async () => {
    const s = state();
    s.workspaces.push(context().workspace);
    s.processes.push({
      workspaceId: 'workspace-a',
      session: 'task',
      identity: { pid: 12345, startedAt: 'original-start-time' },
      port: 8081,
    });
    jest.mocked(sameProcess).mockReturnValue(false);
    jest.mocked(processGroupRunning).mockReturnValue(true);
    expect(await release(context(), s, 'workspace-a', 'task')).toEqual([
      'Process group 12345 survives without its recorded owner; preserved.',
    ]);
    expect(s.processes).toHaveLength(1);
    jest.mocked(processGroupRunning).mockReturnValue(false);
    expect(await release(context(), s, 'workspace-a', 'task')).toEqual([]);
    expect(s.processes).toHaveLength(0);
  });
  test('dry-run does not release or delete a retired device', async () => {
    const s = state();
    s.workspaces.push({ ...context().workspace, archived: true });
    s.devices.push(device({ role: 'native', disposable: true }));
    expect((await reconcile(context(), s, true)).actions.length).toBeGreaterThan(0);
    expect(closeDevice).not.toHaveBeenCalled();
    expect(deleteDevice).not.toHaveBeenCalled();
    expect(s.devices).toHaveLength(1);
  });
});

describe('persistent resource registry', () => {
  test('round-trips state and refuses a foreign repository', () => {
    const s = state();
    saveState(directory, s);
    expect(readState(directory, '/repo/.git')).toEqual(s);
    expect(() => readState(directory, '/another/.git')).toThrow('another repository');
  });
  test('corrupt/unknown versions do not reset ownership records', () => {
    const file = join(directory, 'state.json');
    writeFileSync(file, '{');
    expect(() => readState(directory, '/repo/.git')).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{');
    writeFileSync(file, JSON.stringify({ ...state(), version: 2 }));
    expect(() => readState(directory, '/repo/.git')).toThrow();
  });
  test('rejects artifact path traversal and disposable shared devices', () => {
    expect(() => StateSchema.parse({ ...state(), staging: ['building-../../primary'] })).toThrow();
    const s = state();
    s.devices.push(device({ disposable: true }));
    saveState(directory, s);
    expect(() => readState(directory, '/repo/.git')).toThrow('deletion policy');
  });
});
