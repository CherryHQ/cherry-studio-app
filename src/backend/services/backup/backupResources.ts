import { Directory, File, Paths } from 'expo-file-system';

import { withBackupDatabase } from '@/backend/data/db/backupDatabase';
import { BackupError } from '@/shared/contracts/backup';
import { FileEntryIdSchema, filenameExtension } from '@/shared/data/types/file';

import { archiveFile } from './backupArchive';
import { assertBackupPath, BACKUP_LIMITS, type BackupManifest } from './backupFormat';

const RESOURCE_DIRECTORIES = {
  files: ['Data', 'Files'],
  'avatars/user': ['user-avatar'],
  'avatars/agents': ['agent-avatars'],
  'avatars/providers': ['provider-avatars'],
} as const;

export function restoredFile(root: Directory, path: string): File {
  assertBackupPath(path);
  if (path === 'database/cherry.db') return new File(root, 'database', 'cherry.db');
  const slash = path.lastIndexOf('/');
  const prefix = path.slice(0, slash) as keyof typeof RESOURCE_DIRECTORIES;
  const directory = RESOURCE_DIRECTORIES[prefix];
  if (!directory) throw new BackupError('invalid');
  return new File(root, ...directory, path.slice(slash + 1));
}

export function requireDiskSpace(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new BackupError('invalid');
  if (Paths.availableDiskSpace < bytes + 32 * 1024 * 1024) throw new BackupError('disk-space');
}

export async function describeDatabase(database: File): Promise<{
  requiredPaths: string[];
  counts: BackupManifest['counts'];
}> {
  return withBackupDatabase(database, async (db) => {
    const count = async (table: string) =>
      (await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`))!.count;
    const counts = {
      sessions: await count('agent_session'),
      messages: await count('agent_session_message'),
      files: await count('file_entry'),
      pluginConnections: await count('plugin_authorization'),
    };
    if (counts.files > BACKUP_LIMITS.entries) throw new BackupError('too-large');
    const files = await db.getAllAsync<{ id: string; filename: string }>(
      'SELECT id, filename FROM file_entry',
    );
    const requiredPaths = files.map((file) => {
      const id = FileEntryIdSchema.parse(file.id);
      const ext = filenameExtension(file.filename);
      return `files/${id}${ext ? `.${ext}` : ''}`;
    });
    const agents = await db.getAllAsync<{ avatar: string }>(
      "SELECT avatar FROM agent WHERE avatar LIKE 'agent-avatar-file:%' LIMIT ?",
      BACKUP_LIMITS.entries + 1,
    );
    if (agents.length > BACKUP_LIMITS.entries) throw new BackupError('too-large');
    for (const agent of agents)
      requiredPaths.push(`avatars/agents/${agent.avatar.slice('agent-avatar-file:'.length)}`);
    const userAvatar = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM preference WHERE scope = 'default' AND key = 'app.user.avatar'",
    );
    const avatar: unknown = userAvatar ? JSON.parse(userAvatar.value) : null;
    if (typeof avatar === 'string' && avatar.startsWith('avatar-file:'))
      requiredPaths.push(`avatars/user/${avatar.slice('avatar-file:'.length)}`);
    for (const path of requiredPaths) assertBackupPath(path);
    return { requiredPaths: [...new Set(requiredPaths)], counts };
  });
}

export async function captureResources(
  source: Directory,
  target: Directory,
  signal: AbortSignal,
): Promise<{
  paths: string[];
  counts: BackupManifest['counts'];
}> {
  const description = await describeDatabase(archiveFile(target, 'database/cherry.db'));
  const paths = new Set(description.requiredPaths);
  for (const [prefix, directory] of Object.entries(RESOURCE_DIRECTORIES)) {
    if (prefix === 'files') continue;
    const root = new Directory(source, ...directory);
    if (!root.exists) continue;
    for (const entry of root.list()) {
      if (!(entry instanceof File)) throw new BackupError('invalid');
      const path = `${prefix}/${entry.name}`;
      assertBackupPath(path);
      paths.add(path);
    }
  }
  if (paths.size + 1 > BACKUP_LIMITS.entries) throw new BackupError('too-large');
  const copied = ['database/cherry.db'];
  let totalBytes = archiveFile(target, 'database/cherry.db').size;
  for (const path of [...paths].sort()) {
    signal.throwIfAborted();
    const input = restoredFile(source, path);
    // A full backup never silently omits referenced content.
    if (!input.exists) throw new BackupError('missing-files');
    totalBytes += input.size;
    if (totalBytes > BACKUP_LIMITS.expandedBytes) throw new BackupError('too-large');
    requireDiskSpace(input.size);
    const output = archiveFile(target, path);
    output.parentDirectory.create({ intermediates: true, idempotent: true });
    await input.copy(output);
    copied.push(path);
  }
  return { paths: copied, counts: description.counts };
}

export async function validateResourceReferences(
  root: Directory,
  manifest: BackupManifest,
): Promise<void> {
  const { requiredPaths, counts } = await describeDatabase(archiveFile(root, 'database/cherry.db'));
  if (
    Object.keys(counts).some(
      (key) => counts[key as keyof typeof counts] !== manifest.counts[key as keyof typeof counts],
    )
  )
    throw new BackupError('invalid');
  const available = new Set(manifest.entries.map((entry) => entry.path));
  const required = new Set(requiredPaths);
  for (const path of required) if (!available.has(path)) throw new BackupError('invalid');
  for (const entry of manifest.entries) {
    if (entry.path.startsWith('files/') && !required.has(entry.path))
      throw new BackupError('invalid');
  }
}
