import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';
import { queryKeys, useBackendModule, useQuery } from '@/frontend/data';
import { imageParamsAspectRatio } from '@/frontend/data/paintings/imageGenerationParams';
import {
  type PaintingJobInterruptionReason,
  paintingJobInterruptionReason,
  paintingJobParamValues,
  usePaintingJobs,
} from '@/frontend/data/paintings/usePaintingJobs';
import { useDeletePaintings, useSyncPaintingQueries } from '@/frontend/data/paintings/usePaintings';
import type {
  PaintingGenerationResult as BackendPaintingGenerationResult,
  PaintingGenerationOutput,
  PaintingGenerationStart,
} from '@/shared/contracts';
import { AiFailureSnapshotSchema, type AiFailureSnapshot } from '@/shared/contracts/aiFailure';
import type { JobError } from '@/shared/data/api/schemas/jobs';
import { isTerminalStatus } from '@/shared/data/api/schemas/jobs';
import type { UniqueModelId } from '@/shared/data/types/model';

export type PaintingGenerationStatus = 'idle' | 'generating';

/**
 * The receipt exists but holds no images and nothing is running for it — the
 * previous attempt died with the app, timed out, or the provider refused.
 * The closed reason selects localized recovery copy while provider diagnostics
 * are available in the detail sheet the user opens explicitly.
 */
export type PaintingFailure = { message: string; failure?: AiFailureSnapshot };

function readPaintingFailure(error: JobError | null): PaintingFailure {
  const failure = AiFailureSnapshotSchema.safeParse(error?.params?.failure);
  return {
    message: error?.message ?? 'Painting generation failed',
    ...(failure.success ? { failure: failure.data } : {}),
  };
}

export type PaintingInterruption = {
  failure?: AiFailureSnapshot;
  message?: string;
  reason: PaintingJobInterruptionReason;
};

export type PaintingOutput = PaintingGenerationOutput;

export type PaintingGenerationInput = {
  attachments: readonly ComposerAttachmentReady[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  modelName: string;
  paramValues: ParamValues;
  prompt: string;
};

export type PaintingGenerationResult = BackendPaintingGenerationResult;

const JOB_POLL_INTERVAL_MS = 1000;

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
  const [error, setError] = useState<PaintingFailure | null>(null);
  const [outputs, setOutputs] = useState<PaintingOutput[]>(() => [...initialOutputs]);
  const [status, setStatus] = useState<PaintingGenerationStatus>('idle');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const isGenerationInFlightRef = useRef(false);
  const retryReceiptIdRef = useRef<string | undefined>(undefined);
  const [settledInterruption, setSettledInterruption] = useState<PaintingInterruption | null>(null);
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
    () =>
      settledInterruption ??
      (isInterrupted
        ? {
            ...(interruptedJob?.error ? readPaintingFailure(interruptedJob.error) : {}),
            reason: paintingJobInterruptionReason(interruptedJob),
          }
        : null),
    [interruptedJob, isInterrupted, settledInterruption],
  );

  const jobQuery = useQuery('/jobs/:id', {
    enabled: activeJobId !== null,
    params: { id: activeJobId ?? '' },
    refetchInterval: (job) => (job && isTerminalStatus(job.status) ? false : JOB_POLL_INTERVAL_MS),
    staleTime: 0,
  });

  const job = jobQuery.data;
  // This subscribes to an external store (the job ledger, via the poll query)
  // rather than deriving a value: completion refreshes persisted outputs and
  // clears the active query together. Submission has already been accepted;
  // execution failures belong to the result, not the composer's draft recovery.
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
    setSettledJobIds((current) => new Set(current).add(job.id));
    setActiveJobId(null);
    cancelRequestedRef.current = false;
    isGenerationInFlightRef.current = false;
    if (job.status === 'completed') {
      setError(null);
      retryReceiptIdRef.current = undefined;
      const result = job.output as PaintingGenerationResult;
      setOutputs(result.outputs);
      setStatus('idle');
      void syncPaintingQueries(result.painting);
      return;
    }
    if (job.status === 'cancelled') {
      retryReceiptIdRef.current = receiptIdRef.current;
      setStatus('idle');
      setError(null);
      setSettledInterruption({ ...readPaintingFailure(job.error), reason: 'interrupted' });
      return;
    }
    retryReceiptIdRef.current = receiptIdRef.current;
    const failure = readPaintingFailure(job.error);
    setStatus('idle');
    setError(failure);
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

          setSettledJobIds((current) => new Set(current).add(jobId));
          setActiveJobId(null);
          setError(null);
          setSettledInterruption(null);
          retryReceiptIdRef.current = undefined;
          isGenerationInFlightRef.current = false;
          setStatus('idle');
          cancelRequestedRef.current = false;
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
    async (input: PaintingGenerationInput): Promise<PaintingGenerationStart | null> => {
      if (isGenerationInFlightRef.current || activeJobId !== null) {
        throw new Error('Painting generation is already in progress');
      }
      isGenerationInFlightRef.current = true;
      cancelRequestedRef.current = false;
      setError(null);
      setSettledInterruption(null);
      setDisplayParamValues(input.paramValues);
      setStatus('generating');

      let accepted = false;
      try {
        const retryReceiptId = retryReceiptIdRef.current ?? (interruption ? paintingId : undefined);
        const started = await paintings.startGeneration({
          fileEntryIds: input.attachments.map((attachment) => attachment.fileEntryId),
          mode: input.mode,
          modelId: input.modelId,
          modelName: input.modelName,
          // Retrying reuses the interrupted receipt so its gallery tile flips in
          // place; a receipt that already holds images is never passed here, and
          // the backend rejects it if one ever is.
          ...(retryReceiptId ? { paintingId: retryReceiptId } : {}),
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
        setActiveJobId(started.jobId);
        accepted = true;
        return started;
      } catch (generationError) {
        const normalized =
          generationError instanceof Error ? generationError : new Error(String(generationError));
        // A rejected submission leaves the previous result and draft intact.
        setError(error);
        setSettledInterruption(settledInterruption);
        setDisplayParamValues(displayParamValues);
        setStatus('idle');
        throw normalized;
      } finally {
        if (!accepted) isGenerationInFlightRef.current = false;
      }
    },
    [
      activeJobId,
      cancelStartedGeneration,
      displayParamValues,
      error,
      interruption,
      onReceipt,
      paintingId,
      paintings,
      queryClient,
      settledInterruption,
    ],
  );

  const cancel = useCallback(() => {
    cancelRequestedRef.current = true;
    if (activeJobId === null) {
      return Promise.resolve(false);
    }
    const receiptId = receiptIdRef.current ?? paintingId;
    return cancelStartedGeneration(activeJobId, receiptId);
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
