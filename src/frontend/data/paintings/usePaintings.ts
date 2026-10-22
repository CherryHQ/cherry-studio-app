import {
  queryOptions,
  useQueries,
  useQueryClient,
  useQuery as useTanStackQuery,
} from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useMemo } from 'react';

import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';
import {
  queryKeys,
  useBackendModule,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@/frontend/data';
import type { PaintingGenerationInput, PaintingsModule, ResolvedFile } from '@/shared/contracts';
import type { Painting, PaintingBoard, PaintingBoardSummary } from '@/shared/data/types/painting';

import { type PaintingBoardCoverContent, paintingBoardCover } from './paintingBoardCover';
import { usePaintingJobs } from './usePaintingJobs';

const boardPageSize = 20;

export type ResolvedPaintingAttachment = ComposerAttachmentReady;

export type ResolvedPaintingFiles = {
  inputs: ResolvedPaintingAttachment[];
  outputAspectRatio?: number;
  outputs: ResolvedPaintingAttachment[];
};

export function usePaintingBoards() {
  const query = useInfiniteQuery('/painting-boards', { limit: boardPageSize });
  const boards = useMemo(() => query.pages.flatMap((page) => page.items), [query.pages]);

  return {
    boards,
    error: query.error,
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    loadMore: query.loadNext,
    refresh: query.refresh,
  };
}

export type PaintingBoardCard = PaintingBoardCoverContent & {
  board: PaintingBoard;
  paintingCount: number;
};

/** Gallery cards: each board with the cover its newest receipts and running jobs make. */
export function usePaintingBoardCards(summaries: readonly PaintingBoardSummary[]) {
  const recentPaintings = useMemo(
    () => summaries.flatMap((summary) => summary.recentPaintings),
    [summaries],
  );
  const outputs = usePaintingOutputs(recentPaintings);
  const { activeByPaintingId } = usePaintingJobs();
  const cards = useMemo<PaintingBoardCard[]>(() => {
    const activePaintingIds = new Set(activeByPaintingId.keys());
    return summaries.map((summary) => ({
      ...paintingBoardCover(
        summary.recentPaintings,
        outputs.byPaintingId,
        activePaintingIds,
        summary.imageCount,
      ),
      board: summary.board,
      paintingCount: summary.paintingCount,
    }));
  }, [activeByPaintingId, outputs.byPaintingId, summaries]);

  return { cards, isLoading: outputs.isLoading };
}

/** Starts a generation as a durable job and wakes the views that observe it. */
export function useStartPaintingGeneration() {
  const paintings = useBackendModule('paintings');
  const queryClient = useQueryClient();

  return useCallback(
    async (input: PaintingGenerationInput) => {
      const started = await paintings.startGeneration(input);
      // The active-job poll stops once nothing runs, so a fresh enqueue wakes it.
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all() });
      void queryClient.invalidateQueries({
        predicate: (query) => queryKeys.paintings.isBoardQuery(query.queryKey),
      });
      return started;
    },
    [paintings, queryClient],
  );
}

export function useDeletePaintings() {
  const queryClient = useQueryClient();
  const paintingsBackend = useBackendModule('paintings');
  const { activeByPaintingId } = usePaintingJobs();
  const mutation = useMutation('DELETE', '/paintings', {
    refresh: ['/painting-boards', '/painting-boards/*'],
  });
  const deletePaintings = mutation.trigger;

  return useCallback(
    async (ids: readonly string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return;
      }

      // Stop first: a generation that lands after its receipt is gone fails on
      // the write and burns the provider call for images nobody can reach.
      await Promise.all(
        uniqueIds.flatMap((id) => {
          const job = activeByPaintingId.get(id);
          return job ? [paintingsBackend.cancelGeneration(job.id)] : [];
        }),
      );
      await deletePaintings({ query: { ids: uniqueIds } });
      for (const id of uniqueIds) {
        // Drop rather than invalidate: refetching a deleted painting would throw.
        queryClient.removeQueries({ queryKey: queryKeys.paintings.detail(id) });
        queryClient.removeQueries({ queryKey: queryKeys.paintings.imageAspectRatios(id) });
        queryClient.removeQueries({ queryKey: queryKeys.paintings.resolvedFiles(id) });
      }
    },
    [activeByPaintingId, deletePaintings, paintingsBackend, queryClient],
  );
}

export function usePainting(id: string | undefined) {
  return useQuery('/paintings/:id', {
    enabled: Boolean(id),
    params: { id: id ?? '' },
  });
}

export function useResolvedPaintingFiles(painting: Painting | undefined) {
  const paintings = useBackendModule('paintings');
  const resolvedFiles = useTanStackQuery({
    ...resolvedPaintingFilesQueryOptions(paintings, painting),
    enabled: Boolean(painting),
  });
  const primaryOutput = resolvedFiles.data?.outputs[0];
  const outputAspectRatio = useTanStackQuery({
    ...imageAspectRatioQueryOptions(painting?.id, primaryOutput?.entry.id, primaryOutput?.uri),
    enabled: Boolean(primaryOutput),
  });
  const data = useMemo<ResolvedPaintingFiles | undefined>(() => {
    const resolved = resolvedFiles.data;
    if (!resolved) {
      return undefined;
    }

    const resolveAttachment = ({ entry, uri }: (typeof resolved.inputs)[number]) => ({
      fileEntryId: entry.id,
      id: `painting-file:${entry.id}`,
      kind: 'image' as const,
      mediaType: entry.mediaType,
      name: entry.filename,
      size: entry.size,
      status: 'ready' as const,
      uri,
    });

    return {
      inputs: resolved.inputs.map(resolveAttachment),
      outputAspectRatio: outputAspectRatio.data,
      outputs: resolved.outputs.map(resolveAttachment),
    };
  }, [outputAspectRatio.data, resolvedFiles.data]);

  return {
    data,
    error: resolvedFiles.error,
    isLoading: resolvedFiles.isLoading || outputAspectRatio.isLoading,
    refetch: async () => {
      await resolvedFiles.refetch();
      if (primaryOutput) await outputAspectRatio.refetch();
    },
  };
}

/** The resolved output images of each painting, keyed by painting id. */
export function usePaintingOutputs(paintings: readonly Painting[]) {
  const paintingsBackend = useBackendModule('paintings');
  const queries = useMemo(
    () =>
      paintings.map((painting) => resolvedPaintingFilesQueryOptions(paintingsBackend, painting)),
    [paintings, paintingsBackend],
  );
  const combine = useCallback(
    (results: readonly { data?: { outputs: ResolvedFile[] }; isLoading: boolean }[]) => {
      const byPaintingId = new Map<string, readonly ResolvedFile[]>();
      paintings.forEach((painting, index) => {
        const outputs = results[index]?.data?.outputs;
        if (outputs) byPaintingId.set(painting.id, outputs);
      });
      return { byPaintingId, isLoading: results.some((result) => result.isLoading) };
    },
    [paintings],
  );

  return useQueries({ combine, queries });
}

export function resolvedPaintingFilesQueryOptions(
  paintings: PaintingsModule,
  painting: Painting | undefined,
) {
  return queryOptions({
    meta: { fileEntryIds: [...(painting?.files.input ?? []), ...(painting?.files.output ?? [])] },
    queryFn: async () =>
      painting ? await paintings.resolveFiles(painting) : { inputs: [], outputs: [] },
    queryKey: queryKeys.paintings.resolvedFilesRevision(
      painting?.id ?? '',
      painting?.updatedAt ?? '',
    ),
    staleTime: Infinity,
  });
}

function imageAspectRatioQueryOptions(
  paintingId: string | undefined,
  fileEntryId: string | undefined,
  uri: string | undefined,
) {
  return queryOptions({
    queryFn: () => loadImageAspectRatio(uri ?? ''),
    queryKey: queryKeys.paintings.imageAspectRatio(paintingId ?? '', fileEntryId ?? '', uri ?? ''),
    staleTime: Infinity,
  });
}

async function loadImageAspectRatio(uri: string): Promise<number> {
  try {
    const image = await ExpoImage.loadAsync(uri);
    return image.width > 0 && image.height > 0 ? image.width / image.height : 1;
  } catch {
    return 1;
  }
}
