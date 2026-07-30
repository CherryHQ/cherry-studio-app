import { type InfiniteData, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useMemo } from 'react';

import { queryKeys } from '@/data/api';
import { useDataInfiniteQuery, useDataMutation, useDataQuery } from '@/data/hooks';
import type { CursorPaginationResponse } from '@/data/types/apiTypes';
import { imageMediaTypeFromExtension } from '@/data/types/file';
import type { Painting } from '@/data/types/painting';
import type { ChatInputAttachmentDraft } from '@/features/chat/input/utils/chatInputAttachments';

const pageSize = 20;

type PaintingListQueryKey = ReturnType<typeof queryKeys.paintings.list>;
type PaintingDetailQueryKey = ReturnType<typeof queryKeys.paintings.detail>;

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
  const query = useDataInfiniteQuery<
    CursorPaginationResponse<Painting>,
    Error,
    InfiniteData<CursorPaginationResponse<Painting>, string | undefined>,
    PaintingListQueryKey,
    string | undefined
  >({
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: undefined,
    queryFn: (services, { pageParam }) =>
      services.painting.listByCursor({ cursor: pageParam, limit: pageSize }),
    queryKey: queryKeys.paintings.list({ limit: pageSize }),
  });
  const paintings = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.items),
    [query.data?.pages],
  );
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;
  const loadMore = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    await fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return {
    isLoading: query.isLoading,
    isLoadingMore: isFetchingNextPage,
    loadMore,
    paintings,
    query,
  };
}

export function usePaintingIds({ enabled }: { enabled: boolean }) {
  return useDataQuery({
    enabled,
    queryFn: (services) => services.painting.listAllIds(),
    queryKey: queryKeys.paintings.allIds(),
  });
}

export function useDeletePaintings() {
  const queryClient = useQueryClient();
  const { mutateAsync } = useDataMutation({
    invalidateQueries: [queryKeys.paintings.all()],
    mutationFn: (dataServices, ids: readonly string[]) => dataServices.painting.deleteMany(ids),
    onSuccess: (_result, ids) => {
      for (const id of ids) {
        // Drop rather than invalidate: refetching a deleted painting would throw.
        queryClient.removeQueries({ queryKey: queryKeys.paintings.detail(id) });
      }
    },
  });

  return useCallback(
    async (ids: readonly string[]) => {
      const uniqueIds = [...new Set(ids)];
      if (uniqueIds.length === 0) {
        return;
      }

      await mutateAsync(uniqueIds);
    },
    [mutateAsync],
  );
}

export function usePainting(id: string | undefined) {
  const queryId = id ?? '__new_painting__';
  return useDataQuery<Painting, Error, Painting, PaintingDetailQueryKey>({
    enabled: Boolean(id),
    queryFn: (services) => services.painting.getById(id ?? ''),
    queryKey: queryKeys.paintings.detail(queryId),
  });
}

export function useResolvedPaintingFiles(painting: Painting | undefined) {
  return useDataQuery({
    enabled: Boolean(painting),
    queryFn: async (services): Promise<ResolvedPaintingFiles> => {
      if (!painting) {
        return { inputs: [], outputs: [] };
      }

      const resolveAttachment = async (
        fileEntryId: string,
      ): Promise<ResolvedPaintingAttachment | null> => {
        const [entry, uri] = await Promise.all([
          services.fileEntry.findById(fileEntryId),
          services.fileEntry.resolveUri(fileEntryId),
        ]);
        if (!entry || !uri) {
          return null;
        }
        const mediaType = imageMediaTypeFromExtension(entry.ext);
        return {
          fileEntryId,
          id: `painting-file:${fileEntryId}`,
          kind: 'image' as const,
          mediaType,
          name: entry.ext ? `${entry.name}.${entry.ext}` : entry.name,
          size: entry.origin === 'internal' ? entry.size : undefined,
          uri,
        };
      };
      const inputEntries = await Promise.all(painting.files.input.map(resolveAttachment));
      const outputs = await Promise.all(painting.files.output.map(resolveAttachment));

      return {
        inputs: inputEntries.filter((entry) => entry !== null),
        outputs: outputs.filter((output) => output !== null),
      };
    },
    queryKey: ['painting-files', painting?.id ?? '', painting?.updatedAt ?? ''],
  });
}

export function usePaintingGalleryItems(paintings: readonly Painting[]) {
  return useDataQuery({
    enabled: paintings.length > 0,
    // The key embeds every painting's updatedAt, so loading another page (or a
    // regeneration) mints a fresh key. Keep the previous resolved items visible
    // until the new set resolves so the masonry never blinks to empty mid-scroll.
    placeholderData: keepPreviousData,
    queryFn: async (services): Promise<PaintingGalleryItem[]> => {
      const items = paintings.flatMap((painting) =>
        painting.files.output.map((fileEntryId) => ({ fileEntryId, painting })),
      );
      return (
        await Promise.all(
          items.map(async ({ fileEntryId, painting }) => {
            const uri = await services.fileEntry.resolveUri(fileEntryId);
            if (!uri) {
              return null;
            }
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
        )
      ).filter((item) => item !== null);
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
