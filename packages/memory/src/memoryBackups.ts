import { fromByteArray, toByteArray } from 'base64-js';
import * as z from 'zod';

import {
  assertMemoryTarget,
  decodeMemoryText,
  encodeMemoryText,
  MemoryError,
  type MemoryFiles,
} from './memoryFiles';
import type { MemoryPlatform } from './memoryPlatform';

export const MEMORY_BACKUP_BATCHES = 5;
export const MEMORY_BACKUP_BYTES = 20 * 1024 * 1024;

const hashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .nullable();
const stepSchema = z.strictObject({
  path: z.string(),
  before: z.string().nullable(),
  beforeHash: hashSchema,
  afterHash: hashSchema,
  outcome: z.enum(['pending', 'applied', 'unchanged', 'conflict']),
});
const batchSchema = z.strictObject({
  version: z.literal(1),
  id: z.uuid(),
  createdAt: z.number().int().nonnegative(),
  source: z.enum(['controlled', 'dreaming', 'recovery', 'clear', 'extraction']),
  status: z.enum(['pending', 'completed', 'partial']),
  steps: z.array(stepSchema),
});

export type MemoryBatch = z.infer<typeof batchSchema>;
export type MemoryMutationSource = MemoryBatch['source'];
export interface MemoryFileChange {
  path: string;
  before: Uint8Array | null;
  after: Uint8Array | null;
}

interface StoredBatch {
  filename: string;
  reservedBytes: number;
  batch: MemoryBatch;
}

export function createMemoryBackups(files: MemoryFiles, platform: MemoryPlatform) {
  function encodeBatch(batch: MemoryBatch): Uint8Array {
    return encodeMemoryText(JSON.stringify(batch));
  }

  function reservedBatchBytes(batch: MemoryBatch): number {
    return encodeBatch({
      ...batch,
      status: 'completed',
      steps: batch.steps.map((step) => ({ ...step, outcome: 'unchanged' })),
    }).length;
  }

  function decodeOriginal(step: MemoryBatch['steps'][number]): Uint8Array | null {
    const bytes = step.before === null ? null : toByteArray(step.before);
    if (
      (bytes !== null && fromByteArray(bytes) !== step.before) ||
      files.hash(bytes) !== step.beforeHash
    ) {
      throw new MemoryError(
        'invalid-backup',
        'Memory backup content does not match its recorded hash',
      );
    }
    return bytes;
  }

  async function storedBatches(root: string): Promise<StoredBatch[]> {
    await files.assertPath(root, '');
    const batches: StoredBatch[] = [];
    for (const filename of (await platform.files.list(root, ''))
      .filter((entry) => !entry.directory)
      .map((entry) => entry.name)) {
      if (!/^\d+-[0-9a-f-]{36}\.json$/.test(filename)) continue;
      const bytes = await files.read(root, filename);
      if (!bytes || bytes.length > MEMORY_BACKUP_BYTES) {
        throw new MemoryError('invalid-backup', 'Memory backup manifest is missing or oversized');
      }
      const parsed = batchSchema.safeParse(JSON.parse(decodeMemoryText(bytes)));
      if (!parsed.success)
        throw new MemoryError('invalid-backup', 'Memory backup manifest is invalid');
      const batch = parsed.data;
      if (filename !== batchFilename(batch))
        throw new MemoryError('invalid-backup', 'Memory backup identity mismatch');
      for (const step of batch.steps) {
        assertMemoryTarget(step.path);
        decodeOriginal(step);
      }
      batches.push({
        filename,
        reservedBytes: Math.max(bytes.length, reservedBatchBytes(batch)),
        batch,
      });
    }
    return batches.sort(
      (left, right) =>
        left.batch.createdAt - right.batch.createdAt || left.filename.localeCompare(right.filename),
    );
  }

  function batchFilename(batch: MemoryBatch): string {
    return `${batch.createdAt}-${batch.id}.json`;
  }

  /** The scope owner holds its write lock throughout admission, mutation, and manifest updates. */
  async function createMemoryBackup(
    root: string,
    changes: readonly MemoryFileChange[],
    source: MemoryMutationSource,
  ): Promise<MemoryBatch> {
    const existing = await storedBatches(root);
    const batch: MemoryBatch = {
      version: 1,
      id: platform.randomUUID(),
      createdAt: Math.max(platform.now(), (existing.at(-1)?.batch.createdAt ?? 0) + 1),
      source,
      status: 'pending',
      steps: changes.map((change) => ({
        path: change.path,
        before: change.before === null ? null : fromByteArray(change.before),
        beforeHash: files.hash(change.before),
        afterHash: files.hash(change.after),
        outcome: 'pending',
      })),
    };
    // Retain metadata growth reservations for existing partial/pending batches too.
    let bytes =
      existing.reduce((total, item) => total + item.reservedBytes, 0) + reservedBatchBytes(batch);
    let count = existing.length + 1;
    const latest = existing.findLast((item) =>
      item.batch.steps.some((step) => step.outcome !== 'unchanged'),
    );
    const removable = existing.filter(
      (item) => item.batch.status === 'completed' && item !== latest,
    );
    const prune: StoredBatch[] = [];
    for (const item of removable) {
      if (count <= MEMORY_BACKUP_BATCHES && bytes <= MEMORY_BACKUP_BYTES) break;
      prune.push(item);
      count--;
      bytes -= item.reservedBytes;
    }
    if (count > MEMORY_BACKUP_BATCHES || bytes > MEMORY_BACKUP_BYTES) {
      throw new MemoryError(
        'backup-capacity',
        'Protected recovery data and the required backup exceed the memory backup limit',
      );
    }
    for (const item of prune) await files.write(root, item.filename, null);
    await saveMemoryBackup(root, batch);
    return batch;
  }

  async function saveMemoryBackup(root: string, batch: MemoryBatch): Promise<void> {
    await files.write(root, batchFilename(batch), encodeBatch(batch));
  }

  async function latestMemoryBackup(root: string): Promise<MemoryBatch | undefined> {
    const stored = await storedBatches(root);
    return stored.findLast((item) => item.batch.steps.some((step) => step.outcome !== 'unchanged'))
      ?.batch;
  }

  function memoryBatchStatus(batch: MemoryBatch): MemoryBatch['status'] {
    if (batch.steps.some((step) => step.outcome === 'pending')) return 'pending';
    if (
      batch.steps.some((step) => step.outcome === 'conflict') ||
      (batch.steps.some((step) => step.outcome === 'applied') &&
        batch.steps.some((step) => step.outcome === 'unchanged'))
    )
      return 'partial';
    return 'completed';
  }

  async function reconcileMemoryBackup(
    root: string,
    activeRoot: string,
    batch: MemoryBatch,
  ): Promise<MemoryBatch> {
    if (!batch.steps.some((step) => step.outcome === 'pending')) return batch;
    for (const step of batch.steps) {
      if (step.outcome !== 'pending') continue;
      const actualHash = files.hash(await files.read(activeRoot, step.path));
      step.outcome =
        actualHash === step.afterHash
          ? 'applied'
          : actualHash === step.beforeHash
            ? 'unchanged'
            : 'conflict';
    }
    batch.status = memoryBatchStatus(batch);
    await saveMemoryBackup(root, batch);
    return batch;
  }

  return {
    createMemoryBackup,
    decodeOriginal,
    latestMemoryBackup,
    memoryBatchStatus,
    reconcileMemoryBackup,
    saveMemoryBackup,
  };
}
