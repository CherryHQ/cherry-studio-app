import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  closeDevice,
  deleteDevice,
  processGroupRunning,
  sameProcess,
  sessionActivity,
  worktrees,
} from '../agentEnvironment/host';
import { reconcile, release } from '../agentEnvironment/pool';
import {
  LEASE_IDLE_MS,
  leaseExpired,
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
  sessionActivity: jest.fn(),
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
    temporary: false,
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

describe('device selection', () => {
  const lease = (session: string) => ({ workspaceId: 'workspace-a', session, acquiredAt: now });
  const live = () => false;
  const idle = () => true;
  test('a free resident device is shared by every task', () => {
    const s = state();
    s.devices.push(device());
    expect(selectDevice(s, 'ios', 'workspace-b', 'agent-2', live)).toBe(s.devices[0]);
  });
  test('an actively used resident device sends a parallel task to a temporary device', () => {
    const s = state();
    s.devices.push(device({ lease: lease('agent-1') }));
    expect(selectDevice(s, 'ios', 'workspace-a', 'agent-1', live)).toBe(s.devices[0]);
    expect(selectDevice(s, 'ios', 'workspace-a', 'agent-2', live)).toBeUndefined();
  });
  test('an idle lease lets another task take over the resident device', () => {
    const s = state();
    s.devices.push(device({ lease: lease('agent-1') }));
    expect(selectDevice(s, 'ios', 'workspace-a', 'agent-2', idle)).toBe(s.devices[0]);
  });
  test('a task keeps reusing its own temporary device', () => {
    const s = state();
    const temporary = device({ id: 'temp', temporary: true, lease: lease('agent-2') });
    s.devices.push(device({ lease: lease('agent-1') }), temporary);
    expect(selectDevice(s, 'ios', 'workspace-a', 'agent-2', live)).toBe(temporary);
  });
  test('without a resident device nothing is created', () => {
    expect(() => selectDevice(state(), 'ios', 'workspace-a', 'agent-1', live)).toThrow('adopt');
  });
  test('a lease expires only after its device session has been idle', () => {
    const start = Date.parse(now);
    const l = lease('agent-1');
    expect(leaseExpired(l, undefined, start + LEASE_IDLE_MS - 1)).toBe(false);
    expect(leaseExpired(l, undefined, start + LEASE_IDLE_MS + 1)).toBe(true);
    expect(leaseExpired(l, start + 1000, start + LEASE_IDLE_MS + 1)).toBe(false);
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
  test('releasing keeps the resident device but deletes a temporary one', async () => {
    const s = state();
    const owner = { workspaceId: 'workspace-a', session: 'task', acquiredAt: now };
    s.devices.push(device({ lease: owner }), device({ id: 'temp', temporary: true, lease: owner }));
    expect(await release(context(), s, 'workspace-a', 'task')).toEqual([]);
    expect(s.devices).toEqual([expect.objectContaining({ id: 'sim-id', lease: undefined })]);
    expect(deleteDevice).toHaveBeenCalledTimes(1);
  });
  test('a failed temporary deletion keeps its record and lease for retry', async () => {
    const s = state();
    const owner = { workspaceId: 'workspace-a', session: 'task', acquiredAt: now };
    s.devices.push(device({ id: 'temp', temporary: true, lease: owner }));
    jest.mocked(deleteDevice).mockImplementationOnce(() => {
      throw new Error('deletion not confirmed');
    });
    expect(await release(context(), s, 'workspace-a', 'task')).toEqual(['deletion not confirmed']);
    expect(s.devices[0].lease).toEqual(owner);
  });
  test('an idle temporary device is deleted; one in use is kept', async () => {
    const s = state();
    const owner = { workspaceId: 'workspace-a', session: 'task', acquiredAt: now };
    s.workspaces.push(context().workspace);
    s.devices.push(device({ id: 'temp', temporary: true, lease: owner }));
    jest.mocked(sessionActivity).mockReturnValue(Date.now());
    await reconcile(context(), s);
    expect(s.devices).toHaveLength(1);
    jest.mocked(sessionActivity).mockReturnValue(Date.now() - LEASE_IDLE_MS - 1);
    await reconcile(context(), s);
    expect(deleteDevice).toHaveBeenCalledTimes(1);
    expect(s.devices).toHaveLength(0);
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
  test('rejects artifact path traversal, a second resident device and an unowned temporary one', () => {
    const owner = { pid: 1, startedAt: 'x' };
    expect(() =>
      StateSchema.parse({ ...state(), staging: [{ name: 'building-../../primary', owner }] }),
    ).toThrow();
    const s = state();
    s.devices.push(device(), device({ id: 'another-sim' }));
    saveState(directory, s);
    expect(() => readState(directory, '/repo/.git')).toThrow('Multiple resident devices');
    const t = state();
    t.devices.push(device(), device({ id: 'temp', temporary: true }));
    saveState(directory, t);
    expect(() => readState(directory, '/repo/.git')).toThrow('without an owning lease');
  });
});
