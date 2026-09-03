import type { ParamValues } from '@cherrystudio/provider-registry';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { queryKeys, useQuery } from '@/frontend/data';
import type { JobSnapshot } from '@/shared/data/api/schemas/jobs';

export const PAINTING_GENERATE_JOB_TYPE = 'painting.generate';

const ACTIVE_JOB_STATUSES = 'pending,running,delayed';
const INTERRUPTED_JOB_STATUSES = 'failed,cancelled';
const JOB_POLL_INTERVAL_MS = 1000;
/**
 * Only the newest job per painting is ever read, so this bounds the fan-in
 * rather than the coverage — a painting whose last failure fell off the end has
 * long since been buried under a hundred newer generations.
 */
const INTERRUPTED_JOB_LIMIT = 100;

export type PaintingJobs = {
  /** Newest still-running job per painting; a painting listed here is generating. */
  activeByPaintingId: ReadonlyMap<string, JobSnapshot>;
  isLoading: boolean;
  /**
   * Newest non-completed job per painting, used for the interruption copy and
   * for restoring the params a retry should start from. A painting missing from
   * both maps was interrupted so long ago that job GC already collected it.
   */
  interruptedByPaintingId: ReadonlyMap<string, JobSnapshot>;
};

/**
 * The gallery's live view of `painting.generate`. An output-less painting is
 * "generating" when it appears in {@link PaintingJobs.activeByPaintingId} and
 * "interrupted" otherwise — deriving the interrupted state from the absence of
 * an active job (rather than from a terminal row) keeps it correct even after
 * job GC drops the row that explains why.
 *
 * Polling only runs while something is actually in flight; the list is woken
 * back up by {@link queryKeys.jobs} invalidation when a generation is enqueued.
 */
export function usePaintingJobs(): PaintingJobs {
  const queryClient = useQueryClient();
  const activeQuery = useQuery('/jobs', {
    query: { status: ACTIVE_JOB_STATUSES, type: PAINTING_GENERATE_JOB_TYPE },
    refetchInterval: (jobs) => (jobs && jobs.length > 0 ? JOB_POLL_INTERVAL_MS : false),
    staleTime: 0,
  });
  const interruptedQuery = useQuery('/jobs', {
    query: {
      limit: INTERRUPTED_JOB_LIMIT,
      status: INTERRUPTED_JOB_STATUSES,
      type: PAINTING_GENERATE_JOB_TYPE,
    },
    staleTime: 0,
  });

  const activeJobs = activeQuery.data;
  const activeByPaintingId = useMemo(() => indexByPaintingId(activeJobs), [activeJobs]);
  const interruptedByPaintingId = useMemo(
    () => indexByPaintingId(interruptedQuery.data),
    [interruptedQuery.data],
  );

  // The active set changing is the only signal the gallery gets — nothing else
  // invalidates `/paintings` while the user sits on the list. Both edges matter:
  // a job entering means a receipt was just written that has to show up as
  // generating, and a job leaving means its images (or its failure) have landed.
  // Refetching once the active list is in hand also keeps the two in step, so a
  // fresh receipt is never read as interrupted for want of its job.
  const previousActiveIds = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!activeJobs) {
      return;
    }
    const currentIds = new Set(activeJobs.map((job) => job.id));
    const previousIds = previousActiveIds.current;
    const settled = [...previousIds].some((id) => !currentIds.has(id));
    const started = [...currentIds].some((id) => !previousIds.has(id));
    previousActiveIds.current = currentIds;
    if (!settled && !started) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.paintings.all() });
    if (settled) {
      // Only a terminal row explains an interruption, and the active poll never
      // carries one.
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all() });
    }
  }, [activeJobs, queryClient]);

  return {
    activeByPaintingId,
    isLoading: activeQuery.isLoading || interruptedQuery.isLoading,
    interruptedByPaintingId,
  };
}

/**
 * Provider text worth putting in front of the user. A cancelled job carries an
 * internal English string (`Cancelled by startup recovery`, `Cancelled by
 * user`) that never went through i18n, so only genuine failures speak for
 * themselves; the caller supplies its own copy for the rest.
 */
export function paintingJobFailureMessage(job: JobSnapshot | undefined): string | undefined {
  return job?.status === 'failed' ? job.error?.message : undefined;
}

export function paintingJobParamValues(job: JobSnapshot | undefined): ParamValues | undefined {
  const paramValues = (job?.input as { paramValues?: unknown } | null)?.paramValues;
  return paramValues && typeof paramValues === 'object' ? (paramValues as ParamValues) : undefined;
}

/** `list` orders by `createdAt` descending, so the first hit per painting is the newest. */
function indexByPaintingId(
  jobs: readonly JobSnapshot[] | undefined,
): ReadonlyMap<string, JobSnapshot> {
  const byPaintingId = new Map<string, JobSnapshot>();
  for (const job of jobs ?? []) {
    const paintingId = (job.input as { paintingId?: unknown } | null)?.paintingId;
    if (typeof paintingId === 'string' && !byPaintingId.has(paintingId)) {
      byPaintingId.set(paintingId, job);
    }
  }
  return byPaintingId;
}
