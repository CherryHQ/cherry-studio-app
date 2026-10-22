import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { type PaintingInputSubmission } from '@/frontend/components/PaintingInput';
import { paintingGenerationInput } from '@/frontend/components/PaintingInput/paintingGenerationInput';
import { queryKeys, useBackendModule } from '@/frontend/data';
import { usePaintingJobs } from '@/frontend/data/paintings/usePaintingJobs';
import {
  useDeletePaintings,
  useStartPaintingGeneration,
} from '@/frontend/data/paintings/usePaintings';
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
export function usePaintingBoardGeneration(initialBoardId: string | undefined) {
  const [boardId, setBoardId] = useState(initialBoardId);
  const paintings = useBackendModule('paintings');
  const queryClient = useQueryClient();
  const startGeneration = useStartPaintingGeneration();
  const deletePaintings = useDeletePaintings();
  const { activeByPaintingId } = usePaintingJobs();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all() });
    void queryClient.invalidateQueries({
      predicate: (query) => queryKeys.paintings.isBoardQuery(query.queryKey),
    });
  }, [queryClient]);

  const generate = useCallback(
    async (input: PaintingInputSubmission) => {
      const started: PaintingGenerationStart = await startGeneration(
        paintingGenerationInput(input, boardId),
      );
      setBoardId(started.boardId);
      return started;
    },
    [boardId, startGeneration],
  );

  /** Stopping discards the receipt: a generation nobody waited for leaves no node behind. */
  const cancel = useCallback(
    async (paintingId: string, isLastPainting: boolean) => {
      const job = activeByPaintingId.get(paintingId);
      if (job) await paintings.cancelGeneration(job.id);
      await deletePaintings([paintingId]);
      // Removing the final receipt also deletes its board. The next send must create a new one.
      if (isLastPainting) setBoardId(undefined);
      refresh();
    },
    [activeByPaintingId, deletePaintings, paintings, refresh],
  );

  /** Sends a stopped generation again in place, so its node keeps its position. */
  const retry = useCallback(
    async (painting: Painting, job: JobSnapshot | undefined) => {
      const input = retryableJobInput(job);
      if (!input) return null;
      return startGeneration({
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
    },
    [startGeneration],
  );

  return { boardId, cancel, generate, retry };
}
