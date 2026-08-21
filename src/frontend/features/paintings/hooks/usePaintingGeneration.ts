import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ComposerAttachmentDraft } from '@/frontend/components/composer/utils/composerAttachments';
import { queryKeys, useBackendModule, useQuery } from '@/frontend/data';
import type {
  PaintingGenerationResult as BackendPaintingGenerationResult,
  PaintingGenerationOutput,
} from '@/shared/contracts';
import { isTerminalStatus } from '@/shared/data/api/schemas/jobs';
import type { UniqueModelId } from '@/shared/data/types/model';

import { imageParamsAspectRatio } from '../utils/imageGenerationParams';
import {
  paintingJobFailureMessage,
  paintingJobParamValues,
  usePaintingJobs,
} from './usePaintingJobs';
import { useDeletePaintings, useSyncPaintingQueries } from './usePaintings';

export type PaintingGenerationStatus = 'idle' | 'generating';

/**
 * The receipt exists but holds no images and nothing is running for it — the
 * previous attempt died with the app, timed out, or the provider refused.
 * `message` is provider text when there is any worth repeating.
 */
export type PaintingInterruption = { message?: string };

export type PaintingOutput = PaintingGenerationOutput;

export type PaintingGenerationInput = {
  attachments: readonly ComposerAttachmentDraft[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  modelName: string;
  paramValues: ParamValues;
  prompt: string;
};

export type PaintingGenerationResult = BackendPaintingGenerationResult;

const JOB_POLL_INTERVAL_MS = 1000;

type PendingSettle = {
  reject: (error: Error) => void;
  resolve: (result: PaintingGenerationResult | null) => void;
};

/**
 * Drives painting generation through the job ledger: `startGeneration` enqueues
 * a `painting.generate` job that outlives this hook, and the terminal snapshot
 * is observed by polling `GET /jobs/:id`.
 *
 * `paintingId` binds the screen to one receipt: the hook adopts that receipt's
 * running job (so returning to it keeps showing progress) and reports it as
 * interrupted when nothing is running and no image ever landed. A composer
 * opened without one is a blank canvas and adopts nothing, however many other
 * generations happen to be in flight.
 */
export function usePaintingGeneration({
  initialAspectRatio,
  initialOutputs,
  onReceipt,
  paintingId,
}: {
  initialAspectRatio?: number;
  initialOutputs: readonly PaintingOutput[];
  /**
   * Fires with the receipt this screen is now bound to (and with `undefined`
   * when a cancel discards it), so the route can carry the id and survive a
   * remount.
   */
  onReceipt?: (paintingId: string | undefined) => void;
  paintingId?: string;
}) {
  const paintings = useBackendModule('paintings');
  const queryClient = useQueryClient();
  const syncPaintingQueries = useSyncPaintingQueries();
  const deletePaintings = useDeletePaintings();
  const jobs = usePaintingJobs();
  const [displayParamValues, setDisplayParamValues] = useState<ParamValues | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [outputs, setOutputs] = useState<PaintingOutput[]>(() => [...initialOutputs]);
  const [status, setStatus] = useState<PaintingGenerationStatus>('idle');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const pendingSettleRef = useRef<PendingSettle | null>(null);
  const cancelPromiseRef = useRef<Promise<boolean> | null>(null);
  const cancelRequestedRef = useRef(false);
  // A job stays in the active list for up to one poll after its terminal row
  // lands; without this the settle effect would re-adopt what it just settled
  // and show it as generating again.
  const [settledJobIds, setSettledJobIds] = useState<ReadonlySet<string>>(() => new Set());
  const receiptIdRef = useRef<string | undefined>(paintingId);
  const aspectRatio = displayParamValues
    ? imageParamsAspectRatio(displayParamValues)
    : (initialAspectRatio ?? 1);

  const runningJob = paintingId === undefined ? undefined : jobs.activeByPaintingId.get(paintingId);
  // Render-phase adjustment (not an effect): the guard makes the setState
  // idempotent, so the extra render pass converges immediately.
  if (activeJobId === null && runningJob && !settledJobIds.has(runningJob.id)) {
    setActiveJobId(runningJob.id);
    setDisplayParamValues(paintingJobParamValues(runningJob) ?? {});
    setStatus('generating');
  }

  // Purely derived: a bound receipt with nothing running and nothing to show
  // is one whose generation never landed. `jobs.isLoading` matters — before the
  // active list arrives every in-flight painting would read as interrupted.
  const isInterrupted =
    paintingId !== undefined &&
    !jobs.isLoading &&
    !runningJob &&
    activeJobId === null &&
    status === 'idle' &&
    outputs.length === 0;
  const interruptedJob = paintingId ? jobs.interruptedByPaintingId.get(paintingId) : undefined;
  const interruption: PaintingInterruption | null = useMemo(
    () => (isInterrupted ? { message: paintingJobFailureMessage(interruptedJob) } : null),
    [interruptedJob, isInterrupted],
  );

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
    if (
      !job ||
      job.id !== activeJobId ||
      !isTerminalStatus(job.status) ||
      cancelRequestedRef.current
    ) {
      return;
    }
    const settle = pendingSettleRef.current;
    pendingSettleRef.current = null;
    setSettledJobIds((current) => new Set(current).add(job.id));
    setActiveJobId(null);
    cancelRequestedRef.current = false;
    if (job.status === 'completed') {
      const result = job.output as PaintingGenerationResult;
      setOutputs(result.outputs);
      setStatus('idle');
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

  const cancelStartedGeneration = useCallback(
    (jobId: string, receiptId: string | undefined): Promise<boolean> => {
      if (cancelPromiseRef.current) {
        return cancelPromiseRef.current;
      }

      const cancellation = (async () => {
        try {
          await paintings.cancelGeneration(jobId);
          if (receiptId !== undefined) {
            await deletePaintings([receiptId]);
            receiptIdRef.current = undefined;
            onReceipt?.(undefined);
          }

          const settle = pendingSettleRef.current;
          pendingSettleRef.current = null;
          setSettledJobIds((current) => new Set(current).add(jobId));
          setActiveJobId(null);
          setError(null);
          setStatus('idle');
          cancelRequestedRef.current = false;
          settle?.resolve(null);
          return true;
        } catch (cancelError) {
          cancelRequestedRef.current = false;
          setError(cancelError instanceof Error ? cancelError : new Error(String(cancelError)));
          return false;
        } finally {
          cancelPromiseRef.current = null;
        }
      })();

      cancelPromiseRef.current = cancellation;
      return cancellation;
    },
    [deletePaintings, onReceipt, paintings],
  );

  const generate = useCallback(
    async (input: PaintingGenerationInput): Promise<PaintingGenerationResult | null> => {
      if (pendingSettleRef.current || activeJobId !== null) {
        throw new Error('Painting generation is already in progress');
      }
      cancelRequestedRef.current = false;
      setError(null);
      setDisplayParamValues(input.paramValues);
      setStatus('generating');

      try {
        const started = await paintings.startGeneration({
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
          modelName: input.modelName,
          // Retrying reuses the interrupted receipt so its gallery tile flips in
          // place; a receipt that already holds images is never passed here, and
          // the backend rejects it if one ever is.
          ...(interruption ? { paintingId } : {}),
          paramValues: input.paramValues,
          prompt: input.prompt,
        });
        receiptIdRef.current = started.paintingId;
        if (cancelRequestedRef.current) {
          const cancelled = await cancelStartedGeneration(started.jobId, started.paintingId);
          if (cancelled) {
            return null;
          }
        }
        onReceipt?.(started.paintingId);
        // The gallery's active-job poll stops once nothing is running, so a
        // fresh enqueue has to wake it explicitly.
        void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all() });
        return await new Promise<PaintingGenerationResult | null>((resolve, reject) => {
          pendingSettleRef.current = { reject, resolve };
          setActiveJobId(started.jobId);
        });
      } catch (generationError) {
        const normalized =
          generationError instanceof Error ? generationError : new Error(String(generationError));
        setError(normalized);
        setStatus('idle');
        throw normalized;
      }
    },
    [
      activeJobId,
      cancelStartedGeneration,
      interruption,
      onReceipt,
      paintingId,
      paintings,
      queryClient,
    ],
  );

  const cancel = useCallback(() => {
    cancelRequestedRef.current = true;
    if (activeJobId === null) {
      return;
    }
    const receiptId = receiptIdRef.current ?? paintingId;
    void cancelStartedGeneration(activeJobId, receiptId);
  }, [activeJobId, cancelStartedGeneration, paintingId]);
  return {
    aspectRatio,
    cancel,
    error,
    generate,
    interruption,
    outputs,
    paramValues: displayParamValues ?? undefined,
    status,
  };
}
