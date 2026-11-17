import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { paintingService } from '@/backend/data/services/PaintingService';
import type { AgentMemoryService } from '@/backend/services/agentMemory';
import type { BackgroundActivityEnvironment } from '@/backend/services/backgroundActivity/BackgroundActivityEnvironment';
import type { BackgroundActivityManager } from '@/backend/services/backgroundActivity/BackgroundActivityManager';
import { paintingFileStorage } from '@/backend/services/paintings/paintingFileStorage';
import {
  createPaintingGenerateJobHandler,
  type PaintingAi,
} from '@/backend/services/paintings/tasks/paintingGenerateJobHandler';

import type { JobType } from './jobRegistry';
import type { JobHandler, JobHandlerFor } from './types';

export type JobHandlerEntry = readonly [string, JobHandler];

/** Preserve payload/type checking at the one type-erasure boundary. */
export function jobHandlerEntry<K extends JobType>(
  type: K,
  handler: JobHandlerFor<K>,
): JobHandlerEntry {
  return Object.freeze([type, Object.freeze(handler) as JobHandler]);
}

/** Complete, immutable production handler registry assembled by the host. */
@Injectable('JobHandlerRegistry')
@ServicePhase(Phase.PostReady)
@DependsOn([
  'AiService',
  'BackgroundActivityManager',
  'BackgroundActivityEnvironment',
  'AgentMemoryService',
])
@AppStatePolicy('not-applicable')
export class JobHandlerRegistry extends BaseService {
  readonly entries: readonly JobHandlerEntry[];

  constructor(
    ai: PaintingAi,
    backgroundActivities: Pick<BackgroundActivityManager, 'startSession'>,
    environment: Pick<BackgroundActivityEnvironment, 'paintingPresenter' | 'translate'>,
    memory: Pick<AgentMemoryService, 'runMaintenance'>,
  ) {
    super();
    this.entries = Object.freeze([
      jobHandlerEntry('memory.maintain', {
        executionClass: 'foreground-only',
        recovery: 'abandon',
        defaultQueue: () => 'memory',
        defaultConcurrency: 1,
        defaultRetryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, backoff: 'none' },
        defaultTimeoutMs: 120_000,
        execute: (context) => memory.runMaintenance(context),
      }),
      jobHandlerEntry(
        'painting.generate',
        createPaintingGenerateJobHandler({
          activities: {
            startSession: (input) =>
              backgroundActivities.startSession({
                ...input,
                presenter: environment.paintingPresenter,
              }),
          },
          ai,
          paintings: paintingService,
          storage: paintingFileStorage,
          translate: environment.translate,
        }),
      ),
    ]);
  }
}
