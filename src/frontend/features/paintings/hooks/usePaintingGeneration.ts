import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import { isTerminalStatus } from '@cherrystudio/universal/data/api/schemas/jobs';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ComposerAttachmentDraft } from '@/frontend/components/composer/utils/composerAttachments';
import { useBackendModule, useQuery } from '@/frontend/data';
import type {
  PaintingGenerationResult as BackendPaintingGenerationResult,
  PaintingGenerationOutput,
} from '@/shared/contracts';

import { useSyncPaintingQueries } from './usePaintings';

export type PaintingGenerationStatus = 'idle' | 'generating' | 'revealing';

export type PaintingOutput = PaintingGenerationOutput;

export type PaintingGenerationInput = {
  attachments: readonly ComposerAttachmentDraft[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  paramValues: ParamValues;
  prompt: string;
};

export type PaintingGenerationResult = BackendPaintingGenerationResult;

const PAINTING_GENERATE_JOB_TYPE = 'painting.generate';
const ACTIVE_JOB_STATUSES = 'pending,running,delayed';
const JOB_POLL_INTERVAL_MS = 1000;

type PendingSettle = {
  reject: (error: Error) => void;
  resolve: (result: PaintingGenerationResult) => void;
};

/**
 * Drives painting generation through the job ledger: `startGeneration` enqueues
 * a `painting.generate` job that outlives this hook, and the terminal snapshot
 * is observed by polling `GET /jobs/:id`. On mount the hook adopts a still
 * active generation left behind by a previous visit, so navigating away and
 * back keeps showing (and eventually reveals) the in-flight result.
 */
export function usePaintingGeneration({
  initialOutputs,
}: {
  initialOutputs: readonly PaintingOutput[];
}) {
  const paintings = useBackendModule('paintings');
  const syncPaintingQueries = useSyncPaintingQueries();
  const [error, setError] = useState<Error | null>(null);
  const [outputs, setOutputs] = useState<PaintingOutput[]>(() => [...initialOutputs]);
  const [status, setStatus] = useState<PaintingGenerationStatus>('idle');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [adoptionSettled, setAdoptionSettled] = useState(false);
  const pendingSettleRef = useRef<PendingSettle | null>(null);

  // Adoption is a one-shot mount decision: a screen that was already open when
  // another screen enqueued a job must not hijack it later.
  const restoreQuery = useQuery('/jobs', {
    enabled: !adoptionSettled && activeJobId === null,
    query: { limit: 1, status: ACTIVE_JOB_STATUSES, type: PAINTING_GENERATE_JOB_TYPE },
    staleTime: 0,
  });
  const restoredJob = restoreQuery.data?.[0];
  const restoreSettled = restoreQuery.data !== undefined || restoreQuery.isError;
  // Render-phase adjustment (not an effect): once the restore query settles,
  // adopt at most once. The `adoptionSettled` guard makes the setState
  // idempotent, so the extra render pass converges immediately.
  if (!adoptionSettled && activeJobId === null && restoreSettled) {
    setAdoptionSettled(true);
    if (restoredJob && !isTerminalStatus(restoredJob.status)) {
      setActiveJobId(restoredJob.id);
      setStatus('generating');
    }
  }

  const jobQuery = useQuery('/jobs/:id', {
    enabled: activeJobId !== null,
    params: { id: activeJobId ?? '' },
    refetchInterval: (job) => (job && isTerminalStatus(job.status) ? false : JOB_POLL_INTERVAL_MS),
    staleTime: 0,
  });

  const job = jobQuery.data;
  // This subscribes to an external store (the job ledger, via the poll query)
  // rather than deriving a value: the terminal snapshot must settle the
  // in-flight `generate` promise exactly once — a side effect that cannot run
  // during render — and the state collapse must happen in the same step, since
  // clearing `activeJobId` disables the query that carries the snapshot.
  /* eslint-disable react-hooks/set-state-in-effect -- see above */
  useEffect(() => {
    if (!job || job.id !== activeJobId || !isTerminalStatus(job.status)) {
      return;
    }
    const settle = pendingSettleRef.current;
    pendingSettleRef.current = null;
    setActiveJobId(null);
    if (job.status === 'completed') {
      const result = job.output as PaintingGenerationResult;
      setOutputs(result.outputs);
      setStatus('revealing');
      void syncPaintingQueries(result.painting);
      settle?.resolve(result);
      return;
    }
    const failure = new Error(job.error?.message ?? 'Painting generation failed');
    setStatus('idle');
    if (settle) {
      // `generate`'s catch records the error for its caller's throw path.
      settle.reject(failure);
    } else {
      setError(failure);
    }
  }, [activeJobId, job, syncPaintingQueries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const generate = useCallback(
    async (input: PaintingGenerationInput): Promise<PaintingGenerationResult> => {
      if (pendingSettleRef.current || activeJobId !== null) {
        throw new Error('Painting generation is already in progress');
      }
      setError(null);
      setStatus('generating');
      setAdoptionSettled(true);

      try {
        const { jobId } = await paintings.startGeneration({
          images: input.attachments.flatMap((attachment) =>
            attachment.kind === 'image'
              ? [
                  {
                    fileEntryId: attachment.fileEntryId,
                    id: attachment.id,
                    mediaType: attachment.mediaType,
                    name: attachment.name,
                    uri: attachment.uri,
                  },
                ]
              : [],
          ),
          mode: input.mode,
          modelId: input.modelId,
          paramValues: input.paramValues,
          prompt: input.prompt,
        });
        return await new Promise<PaintingGenerationResult>((resolve, reject) => {
          pendingSettleRef.current = { reject, resolve };
          setActiveJobId(jobId);
        });
      } catch (generationError) {
        const normalized =
          generationError instanceof Error ? generationError : new Error(String(generationError));
        setError(normalized);
        setStatus('idle');
        throw normalized;
      }
    },
    [activeJobId, paintings],
  );

  const cancel = useCallback(() => {
    if (activeJobId === null) {
      return;
    }
    void paintings.cancelGeneration(activeJobId);
  }, [activeJobId, paintings]);
  const finishReveal = useCallback(() => setStatus('idle'), []);

  return {
    cancel,
    error,
    finishReveal,
    generate,
    outputs,
    status,
  };
}
