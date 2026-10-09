import * as z from 'zod';

import { BackupError } from '@/shared/contracts/backup';

export const BACKUP_LIMITS = {
  archiveBytes: 1024 * 1024 * 1024,
  expandedBytes: 1024 * 1024 * 1024,
  entries: 10_000,
  manifestBytes: 4 * 1024 * 1024,
  chunkBytes: 64 * 1024,
} as const;

const HashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const CountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const BackupManifestSchema = z.strictObject({
  product: z.literal('cherry-mobile'),
  formatVersion: z.literal(1),
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  appVersion: z.string().min(1).max(100),
  platform: z.enum(['ios', 'android']),
  migrations: z
    .array(z.strictObject({ when: CountSchema, sha256: HashSchema }))
    .min(1)
    .max(1000),
  counts: z.strictObject({
    sessions: CountSchema,
    messages: CountSchema,
    files: CountSchema,
    pluginConnections: CountSchema,
  }),
  entries: z
    .array(z.strictObject({ path: z.string().max(512), size: CountSchema, sha256: HashSchema }))
    .min(1)
    .max(BACKUP_LIMITS.entries),
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

export function assertBackupPath(path: string): void {
  const allowed =
    path === 'manifest.json' ||
    path === 'database/cherry.db' ||
    /^(?:files|avatars\/(?:user|agents|providers))\/[^/\\\x00-\x1f]+$/.test(path);
  if (!allowed || path.includes('..') || path.includes(':') || path.length > 512) {
    throw new BackupError('invalid', 'Unsafe archive path.');
  }
}

export function validateManifest(value: unknown): BackupManifest {
  if (
    typeof value === 'object' &&
    value !== null &&
    (('product' in value && value.product !== 'cherry-mobile') ||
      ('formatVersion' in value && value.formatVersion !== 1))
  ) {
    throw new BackupError('incompatible');
  }
  const parsed = BackupManifestSchema.safeParse(value);
  if (!parsed.success) throw new BackupError('invalid');
  const manifest = parsed.data;
  const paths = new Set<string>();
  let size = 0;
  for (const entry of manifest.entries) {
    assertBackupPath(entry.path);
    const key = entry.path.toLowerCase();
    if (key === 'manifest.json' || paths.has(key)) throw new BackupError('invalid');
    paths.add(key);
    size += entry.size;
  }
  if (size > BACKUP_LIMITS.expandedBytes) throw new BackupError('too-large');
  if (!paths.has('database/cherry.db')) throw new BackupError('invalid');
  return manifest;
}
