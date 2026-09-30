import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  assertNoOtherSession,
  closeDevice,
  closeSession,
  discover,
  matchDevice,
  portListeners,
  processCwd,
  processGroupRunning,
  processIdentity,
  routing,
  run,
  sameProcess,
  sessionActivity,
  uninstallApp,
  worktrees,
  type Context,
} from './host';
import { APP_IDS, fingerprint, installPath, verifyArtifact } from './native';
import {
  assertLease,
  leaseExpired,
  saveState,
  workspaceStatus,
  type Device,
  type Platform,
  type State,
} from './state';

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
  const registered = state.devices.map((device) => {
    if (!device.lease) return device;
    try {
      return {
        ...device,
        leaseExpired: leaseExpired(device.lease, sessionActivity(device.lease.session)),
      };
    } catch (error) {
      warnings.push((error as Error).message);
      return device;
    }
  });
  return {
    worktrees: paths,
    workspaces: state.workspaces.map((w) => ({
      ...w,
      status: workspaceStatus(w, paths, existsSync(w.gitDir)),
    })),
    devices,
    registered,
    artifacts: state.artifacts,
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
  const group = Number(run('ps', ['-p', String(pid), '-o', 'pgid=']));
  const command = run('ps', ['-p', String(pid), '-o', 'command=']);
  if (
    processCwd(pid) !== workspacePath ||
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
  const status = (id: string) => {
    const workspace = state.workspaces.find((w) => w.id === id)!;
    return workspaceStatus(workspace, paths, existsSync(workspace.gitDir));
  };
  const actions: string[] = [];
  const warnings: string[] = [];
  for (const entry of [...state.staging]) {
    if (sameProcess(entry.owner)) continue;
    actions.push(`Remove interrupted build staging ${entry.name}`);
    if (!dryRun) {
      rmSync(join(ctx.directory, 'artifacts', entry.name), { force: true, recursive: true });
      state.staging = state.staging.filter((value) => value !== entry);
      saveState(ctx.directory, state);
    }
  }
  for (const { id } of state.workspaces.filter((w) => status(w.id) === 'retired')) {
    const referenced =
      state.devices.some((d) => d.lease?.workspaceId === id) ||
      state.processes.some((p) => p.workspaceId === id);
    actions.push(referenced ? `Release retired workspace ${id}` : `Forget retired workspace ${id}`);
    if (dryRun) continue;
    if (referenced) warnings.push(...(await release(ctx, state, id)));
    if (
      state.devices.some((d) => d.lease?.workspaceId === id) ||
      state.processes.some((p) => p.workspaceId === id)
    )
      continue;
    state.workspaces = state.workspaces.filter((w) => w.id !== id);
    saveState(ctx.directory, state);
  }
  return {
    actions,
    warnings,
    artifactCleanup: { dryRun, keys: gcArtifacts(ctx, state, dryRun) },
    unknown: state.workspaces.filter((w) => status(w.id) === 'unknown').map((w) => w.id),
  };
}

export function adopt(ctx: Context, state: State, platform: Platform, id: string) {
  const previous = state.devices.find((d) => d.platform === platform);
  if (previous?.lease)
    throw new Error(`The registered ${platform} test device is leased; release it first.`);
  const found = discover(platform).find((d) => d.id === id);
  if (!found?.available) throw new Error('Selected device is unavailable.');
  assertNoOtherSession(found);
  const device: Device = {
    platform,
    id,
    name: found.name,
    avdPath: found.avdPath,
    lastUsedAt: new Date().toISOString(),
  };
  state.devices = [...state.devices.filter((d) => d !== previous), device];
  saveState(ctx.directory, state);
  return { device, replaced: previous?.id };
}

// Reuse a Metro process already serving this workspace (for example Conductor's Run
// script); start and record one only when the port is free.
async function ensureMetro(ctx: Context, state: State, session: string, port: number) {
  let listeners = portListeners(port);
  let owned: State['processes'][number] | undefined;
  if (!listeners.length) {
    const previous = state.processes.find(
      (p) => p.workspaceId === ctx.workspace.id && p.port === port,
    );
    if (previous && processGroupRunning(previous.identity.pid))
      throw new Error('Previous Metro process group still exists; release it before restarting.');
    const logDirectory = join(ctx.cwd, '.context', 'agent-self-testing');
    mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
    const log = openSync(join(logDirectory, 'metro.log'), 'a', 0o600);
    const child = spawn('pnpm', ['dev', '--port', String(port)], {
      cwd: ctx.cwd,
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, CI: '1' },
    });
    closeSync(log);
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    const identity = processIdentity(child.pid!);
    if (!identity) throw new Error('Metro exited before its process identity could be recorded.');
    owned = { workspaceId: ctx.workspace.id, session, identity, port };
    state.processes = [...state.processes.filter((p) => p !== previous), owned];
    saveState(ctx.directory, state);
    child.unref();
  }
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/status`, {
        signal: AbortSignal.timeout(1000),
      });
      ready = (await response.text()) === 'packager-status:running';
    } catch {
      /* Metro is still starting. */
    }
    if (!ready) await delay(500);
  }
  if (!ready)
    throw new Error(
      'Metro did not become ready. Lease/process record retained for release or retry.',
    );
  listeners = portListeners(port);
  const foreign = owned
    ? !sameProcess(owned.identity) ||
      listeners.some(
        (pid) => Number(run('ps', ['-p', String(pid), '-o', 'pgid='])) !== owned.identity.pid,
      )
    : listeners.some((pid) => processCwd(pid) !== ctx.cwd);
  if (foreign)
    throw new Error(`Port ${port} is served by a process outside this workspace; launch stopped.`);
}

export async function start(
  ctx: Context,
  state: State,
  platform: Platform,
  session: string,
  resetData: boolean,
) {
  const cleanup = await reconcile(ctx, state);
  if (cleanup.warnings.length)
    throw new Error(`Resolve cleanup blockers first: ${cleanup.warnings.join('; ')}`);
  const device = state.devices.find((d) => d.platform === platform);
  if (!device)
    throw new Error(`No registered ${platform} test device. Inspect status and adopt one.`);
  const stale = device.lease;
  assertLease(device, ctx.workspace.id, session, stale && sessionActivity(stale.session));
  const hash = fingerprint(ctx.cwd, platform);
  const artifact = state.artifacts.findLast(
    (a) => a.platform === platform && a.fingerprint === hash,
  );
  if (!artifact)
    throw new Error(
      'A matching development artifact is required. Run the explicit build command under build authorization; start never builds.',
    );
  await verifyArtifact(ctx, artifact);
  let found = matchDevice(device);
  if (!found?.available)
    throw new Error('Registered device is missing/unavailable; inspect its record.');
  if (stale && (stale.workspaceId !== ctx.workspace.id || stale.session !== session))
    closeSession(found, stale.session); // Expired: its owner left the device idle.
  assertNoOtherSession(found, session);
  device.lease = { workspaceId: ctx.workspace.id, session, acquiredAt: new Date().toISOString() };
  saveState(ctx.directory, state);

  const port = Number(process.env.CONDUCTOR_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('A valid CONDUCTOR_PORT is required.');
  await ensureMetro(ctx, state, session, port);

  if (!found.booted) {
    run('agent-device', ['boot', ...routing(found)], ctx.cwd, 120_000);
    found = matchDevice(device);
    if (!found?.booted) throw new Error('Device boot was not confirmed; lease retained.');
  }
  const install = async () => {
    run(
      'agent-device',
      ['install', APP_IDS[platform], await installPath(ctx, artifact), ...routing(found!)],
      ctx.cwd,
      120_000,
    );
    device.installedArtifact = artifact.key;
    saveState(ctx.directory, state);
  };
  // Reinstalling a different development client keeps the app's data.
  if (device.installedArtifact !== artifact.key) await install();
  if (resetData) {
    uninstallApp(found, APP_IDS[platform]);
    device.installedArtifact = undefined;
    await install();
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
  const metro = new URL(new URL(launch.url).searchParams.get('url') || '');
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
  const dataFromWorkspace = resetData ? undefined : device.dataWorkspaceId;
  device.dataWorkspaceId = ctx.workspace.id;
  device.lastUsedAt = new Date().toISOString();
  saveState(ctx.directory, state);
  return {
    device: device.id,
    session,
    port,
    artifact: artifact.key,
    // App data left by another workspace can carry a newer database schema.
    dataFromWorkspace: dataFromWorkspace === ctx.workspace.id ? undefined : dataFromWorkspace,
    scenarioVerified: false,
  };
}

export function gcArtifacts(ctx: Context, state: State, dryRun = false) {
  const keep = new Set(state.devices.map((d) => d.installedArtifact));
  // Keep the latest two artifacts per platform for rollback.
  for (const platform of ['ios', 'android'] as const)
    for (const a of state.artifacts
      .filter((a) => a.platform === platform)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 2))
      keep.add(a.key);
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
