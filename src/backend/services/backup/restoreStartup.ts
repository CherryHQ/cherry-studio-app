import { File } from 'expo-file-system';

import { validateBackupDatabase } from '@/backend/data/db/backupDatabase';
import { getStorageBoot, storageDirectory } from '@/backend/data/storage/storagePaths';
import { hashLocalFile } from '@/backend/services/file/fileHash';
import { BackupError } from '@/shared/contracts/backup';

import { BACKUP_LIMITS, validateManifest } from './backupFormat';
import { restoredFile, validateResourceReferences } from './backupResources';

export async function validateRestoringStorage(): Promise<void> {
  if (!getStorageBoot().restoring) return;
  const root = storageDirectory();
  const file = new File(root, 'restore-manifest.json');
  if (!file.exists || file.size > BACKUP_LIMITS.manifestBytes) throw new BackupError('invalid');
  const manifest = validateManifest(JSON.parse(await file.text()));
  // Startup verification has no cancellation path.
  const signal = new AbortController().signal;
  for (const entry of manifest.entries) {
    const resource = restoredFile(root, entry.path);
    if (
      !resource.exists ||
      resource.size !== entry.size ||
      (await hashLocalFile(resource.uri, signal)) !== entry.sha256
    )
      throw new BackupError('invalid');
  }
  await validateBackupDatabase(new File(root, 'database', 'cherry.db'), manifest);
  await validateResourceReferences(root, manifest);
}
