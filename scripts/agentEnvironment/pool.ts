import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, openSync, closeSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  assertNoOtherSession,
  closeDevice,
  deleteDevice,
  discover,
  matchDevice,
  processGroupRunning,
  processIdentity,
  routing,
  run,
  sameProcess,
  worktrees,
  type Context,
} from './host';
import { APP_IDS, ensureBaseline, fingerprint, installPath, verifyArtifact } from './native';
import {
  assertLease,
  collectableDevice,
  saveState,
  selectDevice,
  workspaceStatus,
  type Device,
  type Platform,
  type State,
} from './state';

export function registerWorkspace(ctx: Context, state: State) {
  if (!process.env.CONDUCTOR_WORKSPACE_ID) {
    const registered = state.workspaces.find((w) => w.gitDir === ctx.workspace.gitDir);
    if (registered) ctx.workspace.id = registered.id;
  }
  const previous = state.workspaces.find((w) => w.id === ctx.workspace.id);
  if (previous && previous.gitDir !== ctx.workspace.gitDir)
    throw new Error('Workspace identity changed; inspect the registry.');
  if (previous) Object.assign(previous, ctx.workspace);
  else state.workspaces.push(ctx.workspace);
  saveState(ctx.directory, state);
}

export function inventory(ctx: Context, state: State) {
  const paths = worktrees(ctx.root);
  const devices = [];
  const warnings: string[] = [];
  for (const platform of ['ios', 'android'] as const) {
    try {
      devices.push(...discover(platform));
    } catch (error) {
      warnings.push(`${platform}: ${(error as Error).message}`);
    }
  }
  return {
    worktrees: paths,
    workspaces: state.workspaces.map((w) => ({
      ...w,
      status: workspaceStatus(w, paths, existsSync(w.gitDir)),
    })),
    devices,
    registered: state.devices,
    artifacts: state.artifacts,
    baselines: state.baselines,
    interruptedProvisioning: state.provisioning,
    warnings,
  };
}

async function stopProcess(entry: State['processes'][number], workspacePath: string) {
  const pid = entry.identity.pid;
  if (!sameProcess(entry.identity)) {
    if (processGroupRunning(pid))
      throw new Error(`Process group ${pid} survives without its recorded owner; preserved.`);
    return;
  }
  const cwd = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    .split('\n')
    .find((s) => s.startsWith('n'))
    ?.slice(1);
  const group = Number(run('ps', ['-p', String(pid), '-o', 'pgid=']));
  const command = run('ps', ['-p', String(pid), '-o', 'command=']);
  if (
    cwd !== workspacePath ||
    group !== pid ||
    !command.includes('pnpm') ||
    !command.includes(`--port ${entry.port}`)
  )
    throw new Error(`Process ${pid} no longer matches the recorded Metro owner; preserved.`);
  if (!sameProcess(entry.identity))
    throw new Error(`Process ${pid} changed during inspection; ownership retained.`);
  process.kill(-pid, 'SIGTERM');
  for (let attempt = 0; attempt < 20 && processGroupRunning(pid); attempt++) await delay(100);
  if (sameProcess(entry.identity)) process.kill(-pid, 'SIGKILL');
  for (let attempt = 0; attempt < 20 && processGroupRunning(pid); attempt++) await delay(100);
  if (processGroupRunning(pid)) throw new Error(`Process group ${pid} did not fully stop.`);
}

function assertDeviceBudget(device: Device) {
  const others = (['ios', 'android'] as const)
    .flatMap(discover)
    .filter((d) => d.booted && !(d.platform === device.platform && d.id === device.id));
  if (others.length)
    throw new Error(
      `Running device budget is occupied: ${others.map((d) => d.name).join(', ')}. No devices were stopped.`,
    );
}

export async function release(ctx: Context, state: State, workspaceId: string, session?: string) {
  const errors: string[] = [];
  const blocked = new Set<string>();
  for (const device of state.devices.filter(
    (d) => d.lease?.workspaceId === workspaceId && (!session || d.lease.session === session),
  )) {
    const ownedSession = device.lease!.session;
    try {
      closeDevice(device);
      device.lease = undefined;
      device.lastUsedAt = new Date().toISOString();
      saveState(ctx.directory, state);
    } catch (error) {
      blocked.add(ownedSession);
      errors.push((error as Error).message);
    }
  }
  for (const entry of [...state.processes].filter(
    (p) => p.workspaceId === workspaceId && (!session || p.session === session),
  )) {
    if (blocked.has(entry.session)) continue;
    try {
      const workspace = state.workspaces.find((w) => w.id === workspaceId);
      if (!workspace) throw new Error('Process owner is unknown.');
      await stopProcess(entry, workspace.path);
      state.processes = state.processes.filter((p) => p !== entry);
      saveState(ctx.directory, state);
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return errors;
}

export async function reconcile(ctx: Context, state: State, dryRun = false) {
  const paths = worktrees(ctx.root); // Failure aborts before any destructive action.
  const retired = new Set(
    state.workspaces
      .filter((w) => workspaceStatus(w, paths, existsSync(w.gitDir)) === 'retired')
      .map((w) => w.id),
  );
  const actions: string[] = [];
  const warnings: string[] = [];
  for (const intent of [...state.provisioning]) {
    try {
      const found = discover(intent.platform).find(
        (d) => d.name === intent.name || d.id === intent.name,
      );
      if (found)
        warnings.push(
          `Interrupted provisioning left ${intent.name}; inspect and explicitly adopt ${found.id}.`,
        );
      else if (!dryRun) {
        state.provisioning = state.provisioning.filter((p) => p !== intent);
        saveState(ctx.directory, state);
      }
    } catch (error) {
      warnings.push((error as Error).message);
    }
  }
  for (const name of [...state.staging]) {
    actions.push(`Remove interrupted build staging ${name}`);
    if (!dryRun) {
      rmSync(join(ctx.directory, 'artifacts', name), { force: true, recursive: true });
      state.staging = state.staging.filter((value) => value !== name);
      saveState(ctx.directory, state);
    }
  }
  for (const id of retired) {
    if (
      !state.devices.some((d) => d.lease?.workspaceId === id) &&
      !state.processes.some((p) => p.workspaceId === id)
    )
      continue;
    actions.push(`Release retired workspace ${id}`);
    if (!dryRun) warnings.push(...(await release(ctx, state, id)));
  }
  for (const device of [...state.devices]) {
    if (!collectableDevice(device, retired)) continue;
    actions.push(`Delete unused native device ${device.name} (${device.id})`);
    if (dryRun) continue;
    try {
      closeDevice(device);
      deleteDevice(device);
      state.devices = state.devices.filter((d) => d !== device);
      saveState(ctx.directory, state);
    } catch (error) {
      warnings.push((error as Error).message);
    }
  }
  return {
    actions,
    warnings,
    artifactCleanup: { dryRun, keys: gcArtifacts(ctx, state, dryRun) },
    unknown: state.workspaces
      .filter((w) => workspaceStatus(w, paths, existsSync(w.gitDir)) === 'unknown')
      .map((w) => w.id),
  };
}

export function adopt(
  ctx: Context,
  state: State,
  platform: Platform,
  id: string,
  role: Device['role'],
  disposable: boolean,
) {
  if (state.devices.some((d) => d.platform === platform && d.id === id))
    throw new Error('Device is already registered.');
  if (role === 'shared' && state.devices.some((d) => d.platform === platform && d.role === role))
    throw new Error('A shared device already exists for this platform.');
  if (role !== 'native' && disposable)
    throw new Error('Shared and primary devices cannot be disposable.');
  const found = discover(platform).find((d) => d.id === id);
  if (!found?.available) throw new Error('Selected device is unavailable.');
  assertNoOtherSession(found);
  const device: Device = {
    key: randomUUID(),
    platform,
    id,
    name: found.name,
    avdPath: found.avdPath,
    role,
    disposable,
    fingerprint: role === 'native' ? fingerprint(ctx.cwd, platform) : undefined,
    workspaces: role === 'primary' ? [] : [ctx.workspace.id],
    lastUsedAt: new Date().toISOString(),
  };
  state.devices.push(device);
  state.provisioning = state.provisioning.filter(
    (p) => p.platform !== platform || (p.name !== found.name && p.name !== found.id),
  );
  saveState(ctx.directory, state);
  return device;
}

export function provision(ctx: Context, state: State, platform: Platform, templateId: string) {
  ensureBaseline(ctx, state, platform);
  const hash = fingerprint(ctx.cwd, platform);
  const existing = selectDevice(state, platform, hash);
  if (existing) return existing;
  const role = hash === state.baselines[platform]!.fingerprint ? 'shared' : 'native';
  const template = discover(platform).find((d) => d.id === templateId && d.available);
  if (!template) throw new Error('Explicit existing simulator/emulator template required.');
  const repoId = createHash('sha256').update(ctx.common).digest('hex').slice(0, 8);
  const name = `Cherry_${platform}_${role}_${role === 'native' ? hash.slice(0, 10) : repoId}`;
  if (discover(platform).some((d) => d.id === name || d.name === name))
    throw new Error('Unregistered device already has this name; inspect/adopt it instead.');
  if (state.provisioning.some((p) => p.platform === platform && p.name === name))
    throw new Error(
      'An interrupted provisioning intent exists. Inspect its device before retrying.',
    );
  state.provisioning.push({ platform, name, workspaceId: ctx.workspace.id });
  saveState(ctx.directory, state);
  let id: string;
  if (platform === 'ios')
    id = run('xcrun', ['simctl', 'create', name, template.type!, template.runtime!]);
  else {
    if (!template.image?.startsWith('system-images;'))
      throw new Error('Template has no supported installed Android system image.');
    const result = spawnSync(
      'avdmanager',
      ['create', 'avd', '--name', name, '--package', template.image],
      { encoding: 'utf8', input: 'no\n', timeout: 60_000 },
    );
    if (result.status !== 0) throw new Error('AVD creation failed; provisioning intent retained.');
    id = name;
  }
  const device = adopt(ctx, state, platform, id, role, role === 'native');
  state.provisioning = state.provisioning.filter((p) => p.platform !== platform || p.name !== name);
  saveState(ctx.directory, state);
  return device;
}

export async function prepare(ctx: Context, state: State, platform: Platform, session: string) {
  const cleanup = await reconcile(ctx, state);
  if (cleanup.warnings.length)
    throw new Error(`Resolve cleanup blockers first: ${cleanup.warnings.join('; ')}`);
  ensureBaseline(ctx, state, platform);
  const hash = fingerprint(ctx.cwd, platform);
  const device = selectDevice(state, platform, hash);
  if (!device)
    throw new Error(
      'No compatible registered device. Inspect status, adopt an existing test device, or explicitly provision one.',
    );
  assertLease(device, ctx.workspace.id, session);
  const otherLease = state.devices.find((d) => d.lease && d !== device);
  if (otherLease)
    throw new Error(
      `Self-test slot is occupied by ${otherLease.name}. Wait instead of booting another device.`,
    );
  const found = matchDevice(device);
  if (!found?.available)
    throw new Error('Registered device is missing/unavailable; inspect its record.');
  assertNoOtherSession(found, session);
  assertDeviceBudget(device);
  const artifact = state.artifacts.findLast(
    (a) => a.platform === platform && a.fingerprint === hash,
  );
  if (!artifact)
    throw new Error(
      'A matching development artifact is required. Run the explicit build command under build authorization; prepare never builds.',
    );
  await verifyArtifact(ctx, artifact);
  device.lease ??= { workspaceId: ctx.workspace.id, session, acquiredAt: new Date().toISOString() };
  if (!device.workspaces.includes(ctx.workspace.id)) device.workspaces.push(ctx.workspace.id);
  saveState(ctx.directory, state);
  return { device, artifact, dataHandoffRequired: device.dataWorkspaceId !== ctx.workspace.id };
}

export async function start(
  ctx: Context,
  state: State,
  platform: Platform,
  session: string,
  dataReady: boolean,
) {
  const prepared = await prepare(ctx, state, platform, session);
  if (prepared.dataHandoffRequired && !dataReady)
    throw new Error(
      'Data handoff is required. Establish the scenario baseline under this lease, then explicitly acknowledge it with --data-ready.',
    );
  const { device, artifact } = prepared;
  const port = Number(process.env.CONDUCTOR_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65526)
    throw new Error('A valid CONDUCTOR_PORT is required.');
  const processEntry = state.processes.find(
    (p) => p.workspaceId === ctx.workspace.id && p.session === session && p.port === port,
  );
  if (!processEntry || !sameProcess(processEntry.identity)) {
    if (processEntry && processGroupRunning(processEntry.identity.pid))
      throw new Error('Previous Metro process group still exists; release it before restarting.');
    const listeners = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
    });
    if (listeners.error || listeners.status !== 1)
      throw new Error('Metro port is occupied or cannot be inspected; no process was killed.');
    const logDirectory = join(ctx.cwd, '.context', 'agent-self-testing');
    mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
    const log = openSync(join(logDirectory, 'metro.log'), 'a', 0o600);
    const child = spawn('pnpm', ['dev', '--port', String(port)], {
      cwd: ctx.cwd,
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, PROFILE: 'development', CI: '1' },
    });
    closeSync(log);
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    const identity = processIdentity(child.pid!);
    if (!identity) throw new Error('Metro exited before its process identity could be recorded.');
    state.processes = state.processes.filter((p) => p !== processEntry);
    state.processes.push({ workspaceId: ctx.workspace.id, session, identity, port });
    saveState(ctx.directory, state);
    child.unref();
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`, {
        signal: AbortSignal.timeout(1000),
      });
      if ((await response.text()) === 'packager-status:running') {
        ready = true;
        break;
      }
    } catch {
      /* Metro is still starting. */
    }
    await delay(500);
  }
  if (!ready)
    throw new Error(
      'Metro did not become ready. Lease/process record retained for release or retry.',
    );
  const managed = state.processes.find(
    (p) => p.workspaceId === ctx.workspace.id && p.session === session && p.port === port,
  );
  const listeners = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).split('\n');
  if (
    !managed ||
    !sameProcess(managed.identity) ||
    listeners.some((pid) => Number(run('ps', ['-p', pid, '-o', 'pgid='])) !== managed.identity.pid)
  )
    throw new Error('Metro listener is not owned by the recorded process group; launch stopped.');
  let found = matchDevice(device);
  if (!found?.available) throw new Error('Device became unavailable while Metro was starting.');
  assertNoOtherSession(found, session);
  assertDeviceBudget(device);
  if (!found.booted) {
    run('agent-device', ['boot', ...routing(found)], ctx.cwd, 120_000);
    found = matchDevice(device);
    if (!found?.booted) throw new Error('Device boot was not confirmed; ownership retained.');
  }
  if (device.installedArtifact !== artifact.key) {
    run(
      'agent-device',
      ['install', APP_IDS[platform], await installPath(ctx, artifact), ...routing(found)],
      ctx.cwd,
      120_000,
    );
    device.installedArtifact = artifact.key;
    device.fingerprint = artifact.fingerprint;
    saveState(ctx.directory, state);
  }
  // Obtain Expo's exact launch URL from its local manifest endpoint instead of inventing it.
  const response = await fetch(`http://127.0.0.1:${port}/_expo/open?platform=${platform}`, {
    signal: AbortSignal.timeout(5000),
  });
  const launch = (await response.json()) as { url?: unknown; appId?: unknown; runtime?: unknown };
  if (
    typeof launch.url !== 'string' ||
    launch.appId !== APP_IDS[platform] ||
    launch.runtime !== 'custom'
  )
    throw new Error(
      'Expo did not return the expected development-client target. Metro log and lease retained.',
    );
  const target = new URL(launch.url);
  const metro = new URL(target.searchParams.get('url') || '');
  if (Number(metro.port) !== port)
    throw new Error('Development-client URL points at another Metro port.');
  run(
    'agent-device',
    ['open', APP_IDS[platform], '--session', session, ...routing(found), '--relaunch'],
    ctx.cwd,
    180_000,
  );
  run(
    'agent-device',
    ['open', launch.url, '--session', session, ...routing(found)],
    ctx.cwd,
    180_000,
  );
  device.dataWorkspaceId = ctx.workspace.id;
  device.lastUsedAt = new Date().toISOString();
  saveState(ctx.directory, state);
  return { device: device.id, session, port, artifact: artifact.key, scenarioVerified: false };
}

export function gcArtifacts(ctx: Context, state: State, dryRun = false) {
  const keep = new Set(
    state.devices.flatMap((d) => [
      d.installedArtifact,
      ...state.artifacts.filter((a) => a.fingerprint === d.fingerprint).map((a) => a.key),
    ]),
  );
  for (const platform of ['ios', 'android'] as const) {
    // Keep current public baseline and one recent rollback artifact per platform.
    for (const a of state.artifacts.filter(
      (a) => a.platform === platform && a.fingerprint === state.baselines[platform]?.fingerprint,
    ))
      keep.add(a.key);
    for (const a of state.artifacts
      .filter((a) => a.platform === platform)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 2))
      keep.add(a.key);
  }
  const removed: string[] = [];
  for (const artifact of [...state.artifacts]) {
    if (keep.has(artifact.key) || Date.now() - Date.parse(artifact.createdAt) < 7 * 86400_000)
      continue;
    removed.push(artifact.key);
    if (!dryRun) {
      rmSync(join(ctx.directory, 'artifacts', artifact.key), { recursive: true, force: true });
      state.artifacts = state.artifacts.filter((a) => a !== artifact);
      saveState(ctx.directory, state);
    }
  }
  return removed;
}
