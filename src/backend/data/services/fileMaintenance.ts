import type { FileEntry } from '@cherrystudio/universal/data/types/file';

import { loggerService } from '@/shared/core/logger/LoggerService';

import type { FileEntryService } from './FileEntryService';
import type { FileRefService } from './FileRefService';
import { deleteInternalFile, deleteInternalFileUri, listInternalFiles } from './fileStorage';

export const FILE_MAINTENANCE_GRACE_MS = 60 * 60 * 1000;
export const FILE_MAINTENANCE_BATCH_LIMIT = 100;

export type FileMaintenanceReport = {
  durationMs: number;
  entryCleanup: {
    candidates: number;
    deleted: number;
    failed: number;
    goneOrPinned: number;
    refsReappeared: number;
    unlinkFailures: number;
  };
  orphanFiles: {
    candidates: number;
    deleted: number;
    failed: number;
    scanned: number;
  };
  outcome: 'completed' | 'partial' | 'failed';
};

export type FileMaintenanceDependencies = {
  entries: Pick<
    FileEntryService,
    'deleteTx' | 'findByIdTx' | 'findCleanupCandidates' | 'listAllIds' | 'withWriteTx'
  >;
  refs: Pick<FileRefService, 'countPersistentRefsByEntryIdTx'>;
};

type CandidateOutcome =
  | { entry: FileEntry; kind: 'deleted' }
  | { kind: 'gone-or-pinned' }
  | { kind: 'refs-reappeared' };

const logger = loggerService.withContext('fileMaintenance');

export async function runFileMaintenance(
  dependencies: FileMaintenanceDependencies,
): Promise<FileMaintenanceReport> {
  const startedAt = Date.now();
  const entryCleanup = {
    candidates: 0,
    deleted: 0,
    failed: 0,
    goneOrPinned: 0,
    refsReappeared: 0,
    unlinkFailures: 0,
  };
  const orphanFiles = { candidates: 0, deleted: 0, failed: 0, scanned: 0 };
  let phaseFailures = 0;

  try {
    const candidates = await dependencies.entries.findCleanupCandidates({
      graceMs: FILE_MAINTENANCE_GRACE_MS,
      limit: FILE_MAINTENANCE_BATCH_LIMIT,
    });
    entryCleanup.candidates = candidates.length;

    for (const candidate of candidates) {
      try {
        const outcome = await dependencies.entries.withWriteTx(async (tx) => {
          const current = await dependencies.entries.findByIdTx(tx, candidate.id);
          if (!current || current.cleanupPolicy !== 'delete_when_unreferenced') {
            return { kind: 'gone-or-pinned' } satisfies CandidateOutcome;
          }
          if ((await dependencies.refs.countPersistentRefsByEntryIdTx(tx, current.id)) > 0) {
            return { kind: 'refs-reappeared' } satisfies CandidateOutcome;
          }
          await dependencies.entries.deleteTx(tx, current.id);
          return { entry: current, kind: 'deleted' } satisfies CandidateOutcome;
        });

        if (outcome.kind === 'gone-or-pinned') {
          entryCleanup.goneOrPinned++;
        } else if (outcome.kind === 'refs-reappeared') {
          entryCleanup.refsReappeared++;
        } else {
          entryCleanup.deleted++;
          if (outcome.entry.origin === 'internal') {
            try {
              deleteInternalFile(outcome.entry);
            } catch (error) {
              entryCleanup.unlinkFailures++;
              logger.warn('Failed to delete an unreferenced internal file', error as Error, {
                id: outcome.entry.id,
              });
            }
          }
        }
      } catch (error) {
        entryCleanup.failed++;
        logger.warn('Failed to clean up an unreferenced file entry', error as Error, {
          id: candidate.id,
        });
      }
    }
  } catch (error) {
    phaseFailures++;
    logger.error('Failed to discover file entry cleanup candidates', error as Error);
  }

  try {
    const cutoff = Date.now() - FILE_MAINTENANCE_GRACE_MS;
    const entryIds = await dependencies.entries.listAllIds();
    const files = listInternalFiles();
    orphanFiles.scanned = files.length;
    const candidates = files.filter(
      (file) =>
        !entryIds.has(file.id) && file.modificationTime !== null && file.modificationTime < cutoff,
    );
    orphanFiles.candidates = candidates.length;

    for (const file of candidates) {
      try {
        deleteInternalFileUri(file.uri);
        orphanFiles.deleted++;
      } catch (error) {
        orphanFiles.failed++;
        logger.warn('Failed to delete an orphaned internal file', error as Error, {
          name: file.name,
        });
      }
    }
  } catch (error) {
    phaseFailures++;
    logger.error('Failed to scan Data/Files for orphaned files', error as Error);
  }

  const itemFailures = entryCleanup.failed + entryCleanup.unlinkFailures + orphanFiles.failed;
  const report: FileMaintenanceReport = {
    durationMs: Date.now() - startedAt,
    entryCleanup,
    orphanFiles,
    outcome:
      phaseFailures === 2
        ? 'failed'
        : phaseFailures > 0 || itemFailures > 0
          ? 'partial'
          : 'completed',
  };
  const log = report.outcome === 'completed' ? logger.info.bind(logger) : logger.warn.bind(logger);
  log('File maintenance completed', report);
  return report;
}
