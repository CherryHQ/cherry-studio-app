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
const DeviceSchema = z.object({
  key: z.string().uuid(),
  platform: PlatformSchema,
  id: z.string().min(1),
  name: z.string().min(1),
  avdPath: z.string().startsWith('/').optional(),
  role: z.enum(['primary', 'shared', 'native']),
  // Adoption is explicit; discovery never grants deletion rights.
  disposable: z.boolean(),
  fingerprint: z.string().optional(),
  installedArtifact: z.string().optional(),
  workspaces: z.array(z.string()),
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
const BaselineSchema = z.object({
  commit: z.string(),
  fingerprint: z.string(),
  source: z.string().optional(),
});
export const StateSchema = z.object({
  version: z.literal(1),
  repository: z.string().startsWith('/'),
  workspaces: z.array(WorkspaceSchema),
  devices: z.array(DeviceSchema),
  artifacts: z.array(ArtifactSchema),
  baselines: z.object({ ios: BaselineSchema.optional(), android: BaselineSchema.optional() }),
  processes: z.array(
    z.object({
      workspaceId: z.string(),
      session: z.string(),
      identity: IdentitySchema,
      port: z.number().int().min(1024).max(65535),
    }),
  ),
  // Persisted before provisioning; interrupted creates are reported, never guessed/adopted.
  provisioning: z.array(
    z.object({ platform: PlatformSchema, name: z.string(), workspaceId: z.string() }),
  ),
  staging: z.array(z.string().regex(/^building-[a-f0-9-]{36}$/)).default([]),
});
export type State = z.infer<typeof StateSchema>;

export function readState(directory: string, repository: string): State {
  const file = join(directory, 'state.json');
  if (!existsSync(file))
    return {
      version: 1,
      repository,
      workspaces: [],
      devices: [],
      artifacts: [],
      baselines: {},
      processes: [],
      provisioning: [],
      staging: [],
    };
  const state = StateSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (state.repository !== repository)
    throw new Error('Environment registry belongs to another repository.');
  if (new Set(state.devices.map((d) => `${d.platform}:${d.id}`)).size !== state.devices.length)
    throw new Error('Duplicate device identities in environment registry.');
  if (
    state.devices.some(
      (d) =>
        (d.role !== 'native' && d.disposable) ||
        (d.role === 'primary' && d.lease) ||
        (d.platform === 'android' && !d.avdPath),
    )
  )
    throw new Error('Invalid device ownership/deletion policy in environment registry.');
  for (const platform of ['ios', 'android']) {
    if (state.devices.filter((d) => d.platform === platform && d.role === 'shared').length > 1)
      throw new Error(`Multiple shared ${platform} devices in environment registry.`);
  }
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

export function workspaceStatus(workspace: Workspace, worktrees: string[], gitDirExists: boolean) {
  if (workspace.archived) return 'retired';
  if (worktrees.includes(workspace.path)) return 'active';
  // A directory may survive archival because of untracked files. The saved Git admin
  // directory disappearing AND an authoritative worktree listing establish retirement.
  return gitDirExists ? 'unknown' : 'retired';
}

export function selectDevice(
  state: State,
  platform: Platform,
  fingerprint: string,
): Device | undefined {
  const role = state.baselines[platform]?.fingerprint === fingerprint ? 'shared' : 'native';
  return state.devices.find(
    (device) =>
      device.platform === platform &&
      device.role === role &&
      (role === 'shared' || device.fingerprint === fingerprint),
  );
}

export function assertLease(device: Device, workspaceId: string, session: string) {
  if (device.role === 'primary')
    throw new Error('Primary installations cannot be used for self-testing.');
  if (
    device.lease &&
    (device.lease.workspaceId !== workspaceId || device.lease.session !== session)
  )
    throw new Error(
      `Device is busy: ${device.lease.workspaceId}/${device.lease.session}. Wait; do not create another device.`,
    );
}

export function collectableDevice(device: Device, retired: Set<string>) {
  return (
    device.role === 'native' &&
    device.disposable &&
    !device.lease &&
    device.workspaces.length > 0 &&
    device.workspaces.every((id) => retired.has(id))
  );
}
