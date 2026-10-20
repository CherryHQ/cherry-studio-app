import { flushLogWriter, loggerService } from './LoggerService';

type StartupOperation =
  | 'startup.javascript'
  | 'startup.react_native.milestones'
  | 'startup.bootstrap'
  | 'startup.host'
  | 'startup.phase'
  | 'startup.service'
  | 'startup.database.open'
  | 'startup.database.configure'
  | 'startup.database.migrate'
  | 'startup.database.custom_migrate'
  | 'startup.database.seed'
  | 'startup.cover.wait'
  | 'startup.theme'
  | 'startup.i18n'
  | 'startup.agent'
  | 'startup.skills'
  | 'startup.cover.layout'
  | 'startup.cover.presented'
  | 'startup.cover.minimum_elapsed'
  | 'startup.content.ready'
  | 'startup.cover.exit'
  | 'startup.cover.hidden';

type StartupOutcome = 'started' | 'completed' | 'failed' | 'cancelled';
type StartupFacts = {
  serviceName?: string;
  phase?: string;
  durationMs?: number;
  jsEntryStartMs?: number;
  rnStartupStartMs?: number | null;
  rnRuntimeStartMs?: number | null;
  rnBundleEntryStartMs?: number | null;
};

const logger = loggerService.withContext('Startup');
// JS-entry identity only: neither a device identifier nor a native process-start measurement.
const startupStartedAt = Date.now();
const clockStartedAt = performance.now();

export function recordStartupEvent(
  operation: StartupOperation,
  outcome: StartupOutcome,
  facts: StartupFacts = {},
) {
  logger.info('Startup stage', {
    ...facts,
    operation,
    outcome,
    startupStartedAt,
    elapsedMs: performance.now() - clockStartedAt,
  });
}

/** Relates every event's `elapsedMs` to React Native's `performance.timeOrigin` milestones. */
export function recordJavaScriptEntry() {
  recordStartupEvent('startup.javascript', 'completed', { jsEntryStartMs: clockStartedAt });
}

/** Persist the start too, so an interrupted or stuck stage remains visible. */
export function startStartupStage(operation: StartupOperation, facts: StartupFacts = {}) {
  recordStartupEvent(operation, 'started', facts);
  const startedAt = performance.now();
  let finished = false;
  return (outcome: Exclude<StartupOutcome, 'started'> = 'completed') => {
    if (!finished) {
      finished = true;
      recordStartupEvent(operation, outcome, {
        ...facts,
        durationMs: performance.now() - startedAt,
      });
    }
  };
}

/** A synchronous step blocks the batch timer, so its start is persisted before entering it. */
export function startBlockingStartupStage(operation: StartupOperation) {
  const finish = startStartupStage(operation);
  flushLogWriter();
  return finish;
}

export async function measureStartupStage<T>(
  operation: StartupOperation,
  run: () => T | Promise<T>,
) {
  const finish = startStartupStage(operation);
  try {
    const result = await run();
    finish();
    return result;
  } catch (error) {
    finish('failed');
    throw error;
  }
}
