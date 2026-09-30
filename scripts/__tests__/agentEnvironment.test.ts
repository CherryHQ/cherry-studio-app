import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeDevice, processGroupRunning, sameProcess, worktrees } from '../agentEnvironment/host';
import { reconcile, release } from '../agentEnvironment/pool';
import {
  assertLease,
  LEASE_IDLE_MS,
  leaseExpired,
  readState,
  saveState,
  StateSchema,
  workspaceStatus,
  type Device,
  type State,
} from '../agentEnvironment/state';

jest.mock('../agentEnvironment/host', () => ({
  closeDevice: jest.fn(),
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
    processes: [],
  });
}
function device(overrides: Partial<Device> = {}): Device {
  return {
    platform: 'ios',
    id: 'sim-id',
    name: 'Cherry Test',
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

describe('device lease', () => {
  const lease = { workspaceId: 'workspace-a', session: 'agent-1', acquiredAt: now };
  const start = Date.parse(now);
  test('two agent sessions cannot share the device while its lease is live', () => {
    const d = device({ lease });
    const recent = Date.now();
    expect(() => assertLease(d, 'workspace-a', 'agent-1', recent)).not.toThrow();
    expect(() => assertLease(d, 'workspace-a', 'agent-2', recent)).toThrow('busy');
    expect(() => assertLease(d, 'workspace-b', 'agent-1', recent)).toThrow('busy');
  });
  test('an abandoned lease expires only after its device session has been idle', () => {
    expect(leaseExpired(lease, undefined, start + LEASE_IDLE_MS - 1)).toBe(false);
    expect(leaseExpired(lease, undefined, start + LEASE_IDLE_MS + 1)).toBe(true);
    expect(leaseExpired(lease, start + 1000, start + LEASE_IDLE_MS + 1)).toBe(false);
    expect(() => assertLease(device({ lease }), 'workspace-b', 'agent-2', undefined)).not.toThrow();
  });
});

describe('cleanup authorization and retry', () => {
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
  test('a failed release keeps the retired workspace record, and a later retry forgets it', async () => {
    const s = state();
    s.workspaces.push({ ...context().workspace, archived: true });
    s.devices.push(
      device({ lease: { workspaceId: 'workspace-a', session: 'task', acquiredAt: now } }),
    );
    jest.mocked(closeDevice).mockImplementationOnce(() => {
      throw new Error('identity mismatch');
    });
    expect((await reconcile(context(), s)).warnings).toEqual(['identity mismatch']);
    expect(s.workspaces).toHaveLength(1);
    expect((await reconcile(context(), s)).warnings).toEqual([]);
    expect(s.devices[0].lease).toBeUndefined();
    expect(s.workspaces).toHaveLength(0);
  });
  test('staging of a live build survives reconciliation; a dead owner is reclaimed', async () => {
    const s = state();
    const entry = {
      name: 'building-0f0f0f0f-1111-4111-8111-222222222222',
      owner: { pid: 4321, startedAt: 'build-start' },
    };
    s.staging.push(entry);
    jest.mocked(sameProcess).mockReturnValue(true);
    await reconcile(context(), s);
    expect(s.staging).toEqual([entry]);
    jest.mocked(sameProcess).mockReturnValue(false);
    await reconcile(context(), s);
    expect(s.staging).toEqual([]);
  });
  test('worktree inventory failure aborts cleanup without touching devices', async () => {
    jest.mocked(worktrees).mockImplementation(() => {
      throw new Error('git unavailable');
    });
    await expect(reconcile(context(), state())).rejects.toThrow('git unavailable');
    expect(closeDevice).not.toHaveBeenCalled();
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
  test('dry-run does not release a retired workspace lease', async () => {
    const s = state();
    s.workspaces.push({ ...context().workspace, archived: true });
    s.devices.push(
      device({ lease: { workspaceId: 'workspace-a', session: 'task', acquiredAt: now } }),
    );
    expect((await reconcile(context(), s, true)).actions.length).toBeGreaterThan(0);
    expect(closeDevice).not.toHaveBeenCalled();
    expect(s.devices[0].lease).toBeDefined();
    expect(s.workspaces).toHaveLength(1);
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
  test('rejects artifact path traversal and a second device per platform', () => {
    const owner = { pid: 1, startedAt: 'x' };
    expect(() =>
      StateSchema.parse({ ...state(), staging: [{ name: 'building-../../primary', owner }] }),
    ).toThrow();
    const s = state();
    s.devices.push(device(), device({ id: 'another-sim' }));
    saveState(directory, s);
    expect(() => readState(directory, '/repo/.git')).toThrow('Multiple test devices');
  });
});
