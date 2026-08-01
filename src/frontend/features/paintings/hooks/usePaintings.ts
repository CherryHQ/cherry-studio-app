import {
  keepPreviousData,
  useQueryClient,
  useQuery as useTanStackQuery,
} from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useMemo } from 'react';
import {
  queryKeys,
  useBackendModule,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@/frontend/data';
import type { ChatInputAttachmentDraft } from '@/frontend/features/chat/input/utils/chatInputAttachments';
import { imageMediaTypeFromExtension } from '@cherrystudio/universal/data/types/file';
import type { Painting } from '@cherrystudio/universal/data/types/painting';

const pageSize = 20;

export type PaintingGalleryItem = {
  aspectRatio: number;
  fileEntryId: string;
  key: string;
  painting: Painting;
  uri: string;
};

export type ResolvedPaintingAttachment = ChatInputAttachmentDraft & { fileEntryId: string };

export type ResolvedPaintingFiles = {
  inputs: ResolvedPaintingAttachment[];
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
  const mutation = useMutation('DELETE', '/paintings', {
    refresh: ['/paintings'],
  });
  const deletePaintings = mutation.trigger;

  return useCallback(
    async (ids: readonly string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return;
      }

      await deletePaintings({ query: { ids: uniqueIds } });
      for (const id of uniqueIds) {
        // Drop rather than invalidate: refetching a deleted painting would throw.
        queryClient.removeQueries({ queryKey: queryKeys.paintings.detail(id) });
      }
    },
    [deletePaintings, queryClient],
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
          uri,
        };
      };

      return {
        inputs: resolved.inputs.map(resolveAttachment),
        outputs: resolved.outputs.map(resolveAttachment),
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
    queryFn: async (): Promise<PaintingGalleryItem[]> => {
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
          try {
            const image = await ExpoImage.loadAsync(uri);
            return {
              aspectRatio: image.width > 0 && image.height > 0 ? image.width / image.height : 1,
              fileEntryId,
              key: `${painting.id}:${fileEntryId}`,
              painting,
              uri,
            };
          } catch {
            return {
              aspectRatio: 1,
              fileEntryId,
              key: `${painting.id}:${fileEntryId}`,
              painting,
              uri,
            };
          }
        }),
      );
    },
    queryKey: ['painting-gallery-files', ...paintings.map((painting) => painting.updatedAt)],
  });
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
