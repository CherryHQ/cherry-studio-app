import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import type { Device, Platform, ProcessIdentity, Workspace } from './state';

export function run(
  command: string,
  args: string[],
  cwd = process.cwd(),
  timeout = 30_000,
): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function git(cwd: string, ...args: string[]) {
  return run('git', args, cwd);
}

export function context() {
  if (process.platform !== 'darwin' || process.env.CONDUCTOR_IS_LOCAL === '0')
    throw new Error('Agent environments currently support local macOS workspaces only.');
  const cwd = realpathSync(git(process.cwd(), 'rev-parse', '--show-toplevel'));
  const common = realpathSync(git(cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
  const root = realpathSync(process.env.CONDUCTOR_ROOT_PATH || resolve(common, '..'));
  if (realpathSync(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')) !== common)
    throw new Error('CONDUCTOR_ROOT_PATH does not identify this repository.');
  const gitDir = realpathSync(git(cwd, 'rev-parse', '--absolute-git-dir'));
  const workspace: Workspace = {
    id: process.env.CONDUCTOR_WORKSPACE_ID || gitDir,
    path: cwd,
    gitDir,
    archived: false,
  };
  return { cwd, root, common, workspace, directory: join(root, '.local', 'agent-self-testing') };
}
export type Context = ReturnType<typeof context>;

export function worktrees(root: string): string[] {
  return git(root, 'worktree', 'list', '--porcelain', '-z')
    .split('\0')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice(9));
}

export function processIdentity(pid: number): ProcessIdentity | undefined {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status === 1 && !result.stdout.trim()) return undefined;
  if (result.status !== 0) throw new Error('Unable to inspect process identity.');
  const startedAt = result.stdout.trim();
  return startedAt ? { pid, startedAt } : undefined;
}
export function sameProcess(identity: ProcessIdentity) {
  return processIdentity(identity.pid)?.startedAt === identity.startedAt;
}

export function processGroupRunning(group: number) {
  return run('ps', ['-axo', 'pgid='])
    .split('\n')
    .some((value) => Number(value.trim()) === group);
}

export type ObservedDevice = {
  platform: Platform;
  id: string;
  name: string;
  booted: boolean;
  available: boolean;
  runtime?: string;
  type?: string;
  serial?: string;
  avdPath?: string;
  image?: string;
};

function ini(file: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

export function discover(platform: Platform): ObservedDevice[] {
  if (platform === 'ios') {
    const data = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', '--json']));
    if (!data.devices || typeof data.devices !== 'object')
      throw new Error('Invalid simulator inventory.');
    return Object.entries(data.devices).flatMap(([runtime, devices]) =>
      (
        devices as {
          udid: string;
          name: string;
          state: string;
          isAvailable: boolean;
          deviceTypeIdentifier: string;
        }[]
      ).map((d) => ({
        platform,
        id: d.udid,
        name: d.name,
        booted: d.state !== 'Shutdown',
        available: d.isAvailable,
        runtime,
        type: d.deviceTypeIdentifier,
      })),
    );
  }
  const directory = process.env.ANDROID_AVD_HOME || join(homedir(), '.android', 'avd');
  const devices: ObservedDevice[] = (existsSync(directory) ? readdirSync(directory) : [])
    .filter((name) => name.endsWith('.ini'))
    .map((file) => {
      const metadata = ini(join(directory, file));
      const avdPath = metadata.path;
      if (!avdPath || !existsSync(join(avdPath, 'config.ini')))
        throw new Error(`Unresolvable AVD: ${file}`);
      const config = ini(join(avdPath, 'config.ini'));
      return {
        platform,
        id: basename(file, '.ini'),
        name: config['avd.ini.displayname'] || basename(file, '.ini'),
        avdPath: realpathSync(avdPath),
        available: true,
        booted: false,
        image: config['image.sysdir.1']
          ?.replaceAll('\\', '/')
          .replace(/\/$/, '')
          .replaceAll('/', ';'),
      };
    });
  // Never start the global adb server as a side effect of a startup sweep.
  const server = spawnSync('pgrep', ['-x', 'adb'], { encoding: 'utf8' });
  if (server.error || ![0, 1].includes(server.status ?? -1))
    throw new Error('Cannot inspect adb server.');
  if (server.status === 1) {
    const emulator = spawnSync('pgrep', ['-f', 'qemu-system|/emulator.*-avd'], {
      encoding: 'utf8',
    });
    if (emulator.status !== 1)
      throw new Error('An emulator may be running without adb; Android state is unknown.');
    return devices;
  }
  for (const line of run('adb', ['devices']).split('\n').slice(1).filter(Boolean)) {
    const [serial, status] = line.trim().split(/\s+/);
    if (!serial.startsWith('emulator-')) continue;
    if (status !== 'device')
      throw new Error(`Emulator ${serial} is ${status}; preserve its resources.`);
    const id = run('adb', ['-s', serial, 'emu', 'avd', 'name']).split(/\r?\n/)[0];
    const device = devices.find((d) => d.id === id);
    if (!device) throw new Error(`Running emulator ${serial} has unknown AVD ${id}.`);
    device.serial = serial;
    device.booted = true;
  }
  return devices;
}

export function matchDevice(device: Device): ObservedDevice | undefined {
  const found = discover(device.platform).find((d) => d.id === device.id);
  if (found && found.name !== device.name)
    throw new Error(`Device name changed: ${device.id}; preserve it.`);
  if (
    device.platform === 'android' &&
    ((found && found.avdPath !== device.avdPath) ||
      (!found && device.avdPath && existsSync(device.avdPath)))
  )
    throw new Error(`AVD location changed or inventory is incomplete: ${device.id}; preserve it.`);
  return found;
}

export function sessions(): { name: string; platform: string; deviceId: string }[] {
  const result = JSON.parse(run('agent-device', ['session', 'list', '--json']));
  if (!result.success || !Array.isArray(result.data?.sessions))
    throw new Error('Cannot inspect agent-device sessions.');
  // Nonempty shapes are checked before use; unknown CLI formats block mutation.
  return result.data.sessions.map((value: unknown) => {
    const s = value as Record<string, unknown>;
    const name = s.name;
    const platform = s.platform;
    const deviceId = s.device_udid ?? s.id;
    if (typeof name !== 'string' || typeof platform !== 'string' || typeof deviceId !== 'string')
      throw new Error('Unknown agent-device session format; inspect it before changing devices.');
    return { name, platform, deviceId };
  });
}

export function routing(device: ObservedDevice): string[] {
  if (device.platform === 'ios') return ['--platform', 'ios', '--udid', device.id];
  return device.serial
    ? ['--platform', 'android', '--serial', device.serial]
    : ['--platform', 'android', '--device', device.id];
}

export function assertNoOtherSession(device: ObservedDevice, ownSession?: string) {
  const active = sessions();
  const own = active.find((s) => s.name === ownSession);
  if (
    own &&
    (own.platform !== device.platform ||
      (own.deviceId !== device.id && own.deviceId !== device.serial))
  )
    throw new Error('Recorded session now targets a different device; preserve both devices.');
  const conflict = active.find(
    (s) =>
      s.platform === device.platform &&
      (s.deviceId === device.id || s.deviceId === device.serial) &&
      s.name !== ownSession,
  );
  if (conflict) throw new Error(`Device is used by agent-device session ${conflict.name}.`);
}

export function closeDevice(device: Device) {
  const found = matchDevice(device);
  if (!found) return;
  assertNoOtherSession(found, device.lease?.session);
  if (device.lease && sessions().some((s) => s.name === device.lease!.session))
    run('agent-device', ['close', '--session', device.lease.session, ...routing(found)]);
  if (found.booted) run('agent-device', ['shutdown', ...routing(found)]);
  if (matchDevice(device)?.booted)
    throw new Error('Device shutdown is not complete; ownership retained.');
}

export function deleteDevice(device: Device) {
  const found = matchDevice(device);
  if (!found) return;
  assertNoOtherSession(found);
  if (found.booted) throw new Error('Device must be stopped before deletion.');
  if (device.platform === 'ios') run('xcrun', ['simctl', 'delete', device.id]);
  else run('avdmanager', ['delete', 'avd', '--name', device.id]);
  if (matchDevice(device)) throw new Error('Device deletion was not confirmed.');
}
