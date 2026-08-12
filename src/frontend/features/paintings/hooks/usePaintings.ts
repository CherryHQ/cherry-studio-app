import type { CursorPaginationResponse } from '@cherrystudio/universal/data/api/types';
import type { FileEntryId } from '@cherrystudio/universal/data/types/file';
import type { Painting } from '@cherrystudio/universal/data/types/painting';
import {
  type InfiniteData,
  keepPreviousData,
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
import { imageMediaTypeFromExtension } from '@/shared/utils/imageFileTypes';

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
  return useTanStackQuery({
    enabled: Boolean(painting),
    queryFn: async (): Promise<ResolvedPaintingFiles> => {
      if (!painting) {
        return { inputs: [], outputs: [] };
      }

      const resolved = await paintings.resolveFiles(painting);
      const resolveAttachment = ({ entry, uri }: (typeof resolved.inputs)[number]) => {
        const mediaType = imageMediaTypeFromExtension(entry.ext);
        return {
          fileEntryId: entry.id,
          id: `painting-file:${entry.id}`,
          kind: 'image' as const,
          mediaType,
          name: entry.ext ? `${entry.name}.${entry.ext}` : entry.name,
          size: entry.origin === 'internal' ? entry.size : undefined,
          status: 'ready' as const,
          uri,
        };
      };

      const outputs = resolved.outputs.map(resolveAttachment);
      return {
        inputs: resolved.inputs.map(resolveAttachment),
        outputAspectRatio: outputs[0] ? await loadImageAspectRatio(outputs[0].uri) : undefined,
        outputs,
      };
    },
    queryKey: ['painting-files', painting?.id ?? '', painting?.updatedAt ?? ''],
  });
}

export function usePaintingGalleryItems(paintings: readonly Painting[]) {
  const paintingsBackend = useBackendModule('paintings');
  return useTanStackQuery({
    enabled: paintings.length > 0,
    // The key embeds every painting's updatedAt, so loading another page (or a
    // regeneration) mints a fresh key. Keep the previous resolved items visible
    // until the new set resolves so the masonry never blinks to empty mid-scroll.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PaintingOutputGalleryItem[]> => {
      const items = (
        await Promise.all(
          paintings.map(async (painting) => ({
            painting,
            resolved: await paintingsBackend.resolveFiles(painting),
          })),
        )
      ).flatMap(({ painting, resolved }) =>
        resolved.outputs.map(({ entry, uri }) => ({
          fileEntryId: entry.id,
          painting,
          uri,
        })),
      );
      return await Promise.all(
        items.map(async ({ fileEntryId, painting, uri }) => {
          const base = {
            fileEntryId,
            key: `${painting.id}:${fileEntryId}`,
            kind: 'output' as const,
            painting,
            uri,
          };
          return { ...base, aspectRatio: await loadImageAspectRatio(uri) };
        }),
      );
    },
    queryKey: ['painting-gallery-files', ...paintings.map((painting) => painting.updatedAt)],
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
  }, [jobs.activeByPaintingId, jobs.interruptedByPaintingId, outputItems, paintings]);

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
