import {
  type InfiniteData,
  queryOptions,
  useQueries,
  useQueryClient,
  useQuery as useTanStackQuery,
} from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useMemo } from 'react';

import type { ComposerAttachmentReady } from '@/frontend/components/composer/utils/composerAttachments';
import {
  queryKeys,
  useBackendModule,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@/frontend/data';
import {
  dataApiCollectionFilters,
  removeItemsFromInfiniteData,
  restoreQuerySnapshot,
  updateQueriesOptimistically,
} from '@/frontend/data/utils/optimisticQueryUpdate';
import type { PaintingsModule } from '@/shared/contracts';
import type { CursorPaginationResponse } from '@/shared/data/api/types';
import type { FileEntryId } from '@/shared/data/types/file';
import type { Painting } from '@/shared/data/types/painting';

import { imageParamsAspectRatio, imageParamsResolutionLabel } from '../utils/imageGenerationParams';
import {
  paintingJobFailureMessage,
  paintingJobParamValues,
  usePaintingJobs,
} from './usePaintingJobs';

const pageSize = 20;
type PaintingListData = InfiniteData<CursorPaginationResponse<Painting>, string | undefined>;

export type PaintingOutputGalleryItem = {
  aspectRatio: number;
  fileEntryId: FileEntryId;
  key: string;
  kind: 'output';
  painting: Painting;
  uri: string;
};

/**
 * A receipt with no images yet: either `painting.generate` is still running or
 * it stopped without producing any. Both keep the painting's place in the
 * gallery — the tile is the only way back to a running generation and the only
 * handle on an abandoned one.
 */
export type PaintingPendingGalleryItem = {
  aspectRatio: number;
  key: string;
  kind: 'generating' | 'interrupted';
  /** Provider failure text; absent when there is nothing user-facing to say. */
  message?: string;
  painting: Painting;
  /** Requested size, when the params that asked for it name one. */
  resolution?: string;
};

export type PaintingGalleryItem = PaintingOutputGalleryItem | PaintingPendingGalleryItem;

export type ResolvedPaintingAttachment = ComposerAttachmentReady;

export type ResolvedPaintingFiles = {
  inputs: ResolvedPaintingAttachment[];
  outputAspectRatio?: number;
  outputs: ResolvedPaintingAttachment[];
};

export function usePaintings() {
  const query = useInfiniteQuery('/paintings', { limit: pageSize });
  const paintings = useMemo(() => query.pages.flatMap((page) => page.items), [query.pages]);

  return {
    isLoading: query.isLoading,
    isLoadingMore: query.isLoadingMore,
    loadMore: query.loadNext,
    paintings,
    query,
  };
}

export function usePaintingIds({ enabled }: { enabled: boolean }) {
  return useQuery('/paintings/ids', {
    enabled,
  });
}

export function useDeletePaintings() {
  const queryClient = useQueryClient();
  const paintingsBackend = useBackendModule('paintings');
  const { activeByPaintingId } = usePaintingJobs();
  const mutation = useMutation('DELETE', '/paintings', {
    onMutate: async (variables) => {
      const ids = new Set(variables?.query?.ids ?? []);
      const paintings = await updateQueriesOptimistically<PaintingListData>(
        queryClient,
        dataApiCollectionFilters('/paintings'),
        (current) => removeItemsFromInfiniteData(current, ids),
      );
      const paintingIds = await updateQueriesOptimistically<string[]>(
        queryClient,
        { exact: true, queryKey: ['/paintings/ids'] },
        (current) => current?.filter((id) => !ids.has(id)),
      );

      return { paintingIds, paintings };
    },
    onError: (_error, _variables, context) => {
      restoreQuerySnapshot(queryClient, context?.paintingIds);
      restoreQuerySnapshot(queryClient, context?.paintings);
    },
    refresh: ['/paintings', '/paintings/ids'],
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
        queryClient.removeQueries({ queryKey: queryKeys.paintings.galleryFiles(id) });
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
    isLoading: resolvedFiles.isLoading || outputAspectRatio.isLoading,
  };
}

export function usePaintingGalleryItems(paintings: readonly Painting[]) {
  const paintingsBackend = useBackendModule('paintings');
  const queryClient = useQueryClient();
  const queries = useMemo(
    () =>
      paintings.map((painting) =>
        queryOptions({
          queryKey: queryKeys.paintings.galleryFilesRevision(painting.id, painting.updatedAt),
          queryFn: async (): Promise<PaintingOutputGalleryItem[]> => {
            const resolved = await queryClient.ensureQueryData(
              resolvedPaintingFilesQueryOptions(paintingsBackend, painting),
            );
            return await Promise.all(
              resolved.outputs.map(async ({ entry, uri }) => ({
                aspectRatio: await queryClient.ensureQueryData(
                  imageAspectRatioQueryOptions(painting.id, entry.id, uri),
                ),
                fileEntryId: entry.id,
                key: `${painting.id}:${entry.id}`,
                kind: 'output' as const,
                painting,
                uri,
              })),
            );
          },
          staleTime: Infinity,
        }),
      ),
    [paintings, paintingsBackend, queryClient],
  );
  const combine = useCallback(
    (results: readonly PaintingGalleryQueryResult[]) => {
      const items = results.flatMap((result) => result.data ?? []);
      const settledPaintingIds = new Set(
        paintings.flatMap((painting, index) => (results[index]?.isPending ? [] : [painting.id])),
      );
      return {
        data: items,
        isLoading:
          paintings.length > 0 &&
          settledPaintingIds.size === 0 &&
          results.some((result) => result.isLoading),
        settledPaintingIds,
      };
    },
    [paintings],
  );

  return useQueries({ combine, queries });
}

type PaintingGalleryQueryResult = {
  data: PaintingOutputGalleryItem[] | undefined;
  isLoading: boolean;
  isPending: boolean;
};

function resolvedPaintingFilesQueryOptions(
  paintings: PaintingsModule,
  painting: Painting | undefined,
) {
  return queryOptions({
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

/**
 * The gallery in painting order, with an output-less receipt standing in for
 * its own tile. Placeholders are merged here rather than inside
 * {@link usePaintingGalleryItems} so that the once-per-second job poll never
 * re-runs the image measuring pass behind it.
 */
export function usePaintingGalleryEntries(paintings: readonly Painting[]) {
  const outputs = usePaintingGalleryItems(paintings);
  const jobs = usePaintingJobs();
  const outputItems = outputs.data;

  const items = useMemo(() => {
    const byPaintingId = new Map<string, PaintingOutputGalleryItem[]>();
    for (const item of outputItems ?? []) {
      const existing = byPaintingId.get(item.painting.id);
      if (existing) {
        existing.push(item);
      } else {
        byPaintingId.set(item.painting.id, [item]);
      }
    }

    return paintings.flatMap((painting): PaintingGalleryItem[] => {
      const resolved = byPaintingId.get(painting.id);
      if (resolved && resolved.length > 0) {
        return resolved;
      }
      if (
        !outputs.settledPaintingIds.has(painting.id) &&
        !jobs.activeByPaintingId.has(painting.id)
      ) {
        return [];
      }
      const activeJob = jobs.activeByPaintingId.get(painting.id);
      const interruptedJob = jobs.interruptedByPaintingId.get(painting.id);
      const paramValues = paintingJobParamValues(activeJob ?? interruptedJob);
      return [
        {
          aspectRatio: imageParamsAspectRatio(paramValues),
          // No file entry to key on, and exactly one placeholder per painting:
          // a multi-image request still shows a single tile until its outputs
          // land and the real count is known.
          key: `${painting.id}:pending`,
          kind: activeJob ? 'generating' : 'interrupted',
          message: activeJob ? undefined : paintingJobFailureMessage(interruptedJob),
          painting,
          resolution: imageParamsResolutionLabel(paramValues),
        },
      ];
    });
  }, [
    jobs.activeByPaintingId,
    jobs.interruptedByPaintingId,
    outputItems,
    outputs.settledPaintingIds,
    paintings,
  ]);

  return { isLoading: outputs.isLoading || jobs.isLoading, items };
}

export function useSyncPaintingQueries() {
  const queryClient = useQueryClient();

  return useCallback(
    async (painting: Painting) => {
      queryClient.setQueryData(queryKeys.paintings.detail(painting.id), painting);
      await queryClient.invalidateQueries({ queryKey: queryKeys.paintings.all() });
    },
    [queryClient],
  );
}
