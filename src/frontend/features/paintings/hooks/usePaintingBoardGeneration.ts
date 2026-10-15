import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { PaintingInputSubmission } from '@/frontend/components/PaintingInput';
import { queryKeys, useBackendModule } from '@/frontend/data';
import { usePaintingJobs } from '@/frontend/data/paintings/usePaintingJobs';
import { useDeletePaintings } from '@/frontend/data/paintings/usePaintings';
import type { PaintingGenerationStart } from '@/shared/contracts';
import type { JobSnapshot } from '@/shared/data/api/schemas/jobs';
import type { FileEntryId } from '@/shared/data/types/file';
import { isUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';
import type { Painting } from '@/shared/data/types/painting';

/** The submitted request a stopped job still carries, enough to send it again. */
type RetryableJobInput = {
  images: readonly { fileEntryId: FileEntryId }[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  modelName: string;
  paramValues: ParamValues;
  prompt: string;
};

export function retryableJobInput(job: JobSnapshot | undefined): RetryableJobInput | undefined {
  const input = job?.input as Partial<RetryableJobInput> | null | undefined;
  if (
    !input ||
    !Array.isArray(input.images) ||
    typeof input.mode !== 'string' ||
    typeof input.modelId !== 'string' ||
    !isUniqueModelId(input.modelId) ||
    typeof input.prompt !== 'string'
  ) {
    return undefined;
  }
  return {
    images: input.images,
    mode: input.mode,
    modelId: input.modelId,
    modelName: typeof input.modelName === 'string' ? input.modelName : input.modelId,
    paramValues: input.paramValues ?? {},
    prompt: input.prompt,
  };
}

/**
 * Starts, stops, and retries generations on a board. Generations are durable
 * jobs: the board observes them through the job ledger, so several can run at
 * once and survive leaving the screen.
 */
export function usePaintingBoardGeneration() {
  const paintings = useBackendModule('paintings');
  const queryClient = useQueryClient();
  const deletePaintings = useDeletePaintings();
  const { activeByPaintingId } = usePaintingJobs();

  const refresh = useCallback(() => {
    // The active-job poll stops once nothing runs, so a fresh enqueue wakes it.
    void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.paintings.all() });
    void queryClient.invalidateQueries({
      predicate: (query) => queryKeys.paintings.isBoardQuery(query.queryKey),
    });
  }, [queryClient]);

  const generate = useCallback(
    async (input: PaintingInputSubmission, boardId: string | undefined) => {
      const started: PaintingGenerationStart = await paintings.startGeneration({
        ...(boardId ? { boardId } : {}),
        ...(input.displayPrompt ? { brief: input.displayPrompt } : {}),
        fileEntryIds: input.attachments.map((attachment) => attachment.fileEntryId),
        mode: input.mode,
        modelId: input.modelId,
        modelName: input.modelName,
        paramValues: input.paramValues,
        prompt: input.prompt,
      });
      refresh();
      return started;
    },
    [paintings, refresh],
  );

  /** Stopping discards the receipt: a generation nobody waited for leaves no node behind. */
  const cancel = useCallback(
    async (paintingId: string) => {
      const job = activeByPaintingId.get(paintingId);
      if (job) await paintings.cancelGeneration(job.id);
      await deletePaintings([paintingId]);
      refresh();
    },
    [activeByPaintingId, deletePaintings, paintings, refresh],
  );

  /** Sends a stopped generation again in place, so its node keeps its position. */
  const retry = useCallback(
    async (painting: Painting, job: JobSnapshot | undefined) => {
      const input = retryableJobInput(job);
      if (!input) return null;
      const started = await paintings.startGeneration({
        boardId: painting.boardId,
        ...(painting.brief ? { brief: painting.brief } : {}),
        fileEntryIds: input.images.map((image) => image.fileEntryId),
        mode: input.mode,
        modelId: input.modelId,
        modelName: input.modelName,
        paintingId: painting.id,
        paramValues: input.paramValues,
        prompt: input.prompt,
      });
      refresh();
      return started;
    },
    [paintings, refresh],
  );

  return { cancel, generate, retry };
}
