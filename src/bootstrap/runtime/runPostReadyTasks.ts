import { loggerService } from '@logger';

import type { JobRuntime } from '@/backend/services/jobs/JobRuntime';
import type { BackendServices } from '@/bootstrap/composition/createBackendServices';

const logger = loggerService.withContext('runPostReadyTasks');

/** Runs after the App Bootstrap Gate opens (first paint), off the startup
 * critical path. The gate waits only for database readiness and initial/boot
 * preferences — data repair and diagnostics belong here, not
 * in `initializeAppRuntime`. Best-effort: callers fire-and-forget and a failure
 * must not surface to the user. */
export async function runPostReadyTasks(
  services: BackendServices,
  runtime: { jobRuntime: JobRuntime },
) {
  // The catch lives here, not in callers: they `void` this promise, so a task
  // added below without its own handling would become an unhandled rejection.
  try {
    await Promise.all([
      reconcileStalePendingMessages(services),
      // The first pump also runs lazy startup recovery (abandon/retry/singleton
      // sweeps over prior-process leftovers) and the cold-start GC sweep.
      runtime.jobRuntime.pump({ reason: 'cold-start' }),
    ]);
  } catch (error) {
    logger.error('Post-ready tasks failed', error as Error);
  }
}

/** Crash-orphaned assistant messages left `pending` from a previous run —
 * cold start is the only reliable "no writer is streaming into this" signal,
 * since the OS suspends rather than kills a backgrounded app. Best-effort:
 * a failure here shouldn't block the rest of startup. */
async function reconcileStalePendingMessages(services: BackendServices) {
  try {
    const staleIds = await services.message.findPendingAssistantMessageIds();
    if (staleIds.length === 0) return;
    logger.info('Reconciling crash-orphaned pending assistant messages', {
      count: staleIds.length,
    });
    await services.message.settleCrashedMessages(staleIds);
  } catch (error) {
    logger.error('Failed to reconcile stale pending messages', error as Error);
  }
}
