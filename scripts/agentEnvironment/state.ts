import { spawn } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

export const PlatformSchema = z.enum(['ios', 'android']);
export type Platform = z.infer<typeof PlatformSchema>;
const IdentitySchema = z.object({ pid: z.number().int().positive(), startedAt: z.string().min(1) });
export type ProcessIdentity = z.infer<typeof IdentitySchema>;
const WorkspaceSchema = z.object({
  id: z.string().min(1),
  path: z.string().startsWith('/'),
  gitDir: z.string().startsWith('/'),
  archived: z.boolean().default(false),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
const LeaseSchema = z.object({
  workspaceId: z.string().min(1),
  session: z.string().min(1),
  acquiredAt: z.string().datetime(),
});
export type Lease = z.infer<typeof LeaseSchema>;
const DeviceSchema = z.object({
  platform: PlatformSchema,
  id: z.string().min(1),
  name: z.string().min(1),
  avdPath: z.string().startsWith('/').optional(),
  // Created only while the resident device's lease is live; deleted when its own lease ends.
  temporary: z.boolean().default(false),
  installedArtifact: z.string().optional(),
  lease: LeaseSchema.optional(),
  dataWorkspaceId: z.string().optional(),
  lastUsedAt: z.string().datetime(),
});
export type Device = z.infer<typeof DeviceSchema>;
const ArtifactSchema = z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  platform: PlatformSchema,
  fingerprint: z.string().min(1),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  file: z.enum(['client.tar.gz', 'client.apk']),
  createdAt: z.string().datetime(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
export const StateSchema = z.object({
  version: z.literal(1),
  repository: z.string().startsWith('/'),
  workspaces: z.array(WorkspaceSchema),
  devices: z.array(DeviceSchema),
  artifacts: z.array(ArtifactSchema),
  processes: z.array(
    z.object({
      workspaceId: z.string(),
      session: z.string(),
      identity: IdentitySchema,
      port: z.number().int().min(1024).max(65535),
    }),
  ),
  // Builds run outside the registry lock; the owner identity keeps a live build's staging.
  staging: z
    .array(z.object({ name: z.string().regex(/^building-[a-f0-9-]{36}$/), owner: IdentitySchema }))
    .default([]),
});
export type State = z.infer<typeof StateSchema>;

// Without device activity for this long, a lease lets another task take over the device.
export const LEASE_IDLE_MS = 60 * 60_000;

export function readState(directory: string, repository: string): State {
  const file = join(directory, 'state.json');
  if (!existsSync(file))
    return {
      version: 1,
      repository,
      workspaces: [],
      devices: [],
      artifacts: [],
      processes: [],
      staging: [],
    };
  const state = StateSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (state.repository !== repository)
    throw new Error('Environment registry belongs to another repository.');
  const resident = state.devices.filter((d) => !d.temporary).map((d) => d.platform);
  if (new Set(resident).size !== resident.length)
    throw new Error('Multiple resident devices for one platform in environment registry.');
  if (new Set(state.devices.map((d) => `${d.platform}:${d.id}`)).size !== state.devices.length)
    throw new Error('Duplicate device identities in environment registry.');
  if (state.devices.some((d) => d.temporary && !d.lease))
    throw new Error('Temporary device without an owning lease in environment registry.');
  if (state.devices.some((d) => d.platform === 'android' && !d.avdPath))
    throw new Error('Registered Android device has no AVD path.');
  return state;
}

export function saveState(directory: string, state: State) {
  StateSchema.parse(state);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `state.${process.pid}.tmp`);
  const file = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
  renameSync(temporary, join(directory, 'state.json'));
}

// Kernel flock held by a helper whose stdin is this process: a crash closes the pipe and
// releases the lock. No age-based stale lock deletion.
const LOCK_SCRIPT = `import fcntl, os, sys
fd = os.open(sys.argv[1], os.O_RDWR | os.O_CREAT, 0o600)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(2)
print('locked', flush=True)
sys.stdin.read()
`;

export async function withLock<T>(directory: string, operation: () => Promise<T>): Promise<T> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const holder = spawn('/usr/bin/python3', ['-c', LOCK_SCRIPT, join(directory, 'operation.lock')], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const locked = await new Promise<boolean>((resolve, reject) => {
    holder.once('error', reject);
    holder.stdout.once('data', (data) => resolve(String(data).trim() === 'locked'));
    holder.once('exit', () => resolve(false));
  });
  if (!locked) {
    holder.kill();
    throw new Error('Another environment operation is running; retry when it finishes.');
  }
  try {
    return await operation();
  } finally {
    holder.stdin.end();
  }
}

export function registerWorkspace(ctx: { directory: string; workspace: Workspace }, state: State) {
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

export function workspaceStatus(workspace: Workspace, worktrees: string[], gitDirExists: boolean) {
  if (workspace.archived) return 'retired';
  if (worktrees.includes(workspace.path)) return 'active';
  // A directory may survive archival because of untracked files. The saved Git admin
  // directory disappearing AND an authoritative worktree listing establish retirement.
  return gitDirExists ? 'unknown' : 'retired';
}

// Device activity is the latest agent-device request of the lease's session, if any.
export function leaseExpired(lease: Lease, lastActivity: number | undefined, now = Date.now()) {
  return now - Math.max(Date.parse(lease.acquiredAt), lastActivity ?? 0) > LEASE_IDLE_MS;
}

// The task's own device first, then the resident device when free or its lease expired.
// Undefined means another task is actively using the resident device: create a temporary one.
export function selectDevice(
  state: State,
  platform: Platform,
  workspaceId: string,
  session: string,
  expired: (lease: Lease) => boolean,
): Device | undefined {
  const own = state.devices.find(
    (d) =>
      d.platform === platform &&
      d.lease?.workspaceId === workspaceId &&
      d.lease.session === session,
  );
  if (own) return own;
  const resident = state.devices.find((d) => d.platform === platform && !d.temporary);
  if (!resident)
    throw new Error(`No resident ${platform} test device. Inspect status and adopt one.`);
  return resident.lease && !expired(resident.lease) ? undefined : resident;
}
