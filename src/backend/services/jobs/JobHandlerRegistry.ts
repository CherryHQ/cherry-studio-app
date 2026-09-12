import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { paintingService } from '@/backend/data/services/PaintingService';
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
@DependsOn(['AiService', 'BackgroundActivityManager', 'BackgroundActivityEnvironment'])
@AppStatePolicy('not-applicable')
export class JobHandlerRegistry extends BaseService {
  readonly entries: readonly JobHandlerEntry[];

  constructor(
    ai: PaintingAi,
    backgroundActivities: Pick<BackgroundActivityManager, 'startSession'>,
    environment: Pick<BackgroundActivityEnvironment, 'paintingPresenter' | 'translate'>,
  ) {
    super();
    this.entries = Object.freeze([
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
