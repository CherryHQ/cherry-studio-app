import { type InfiniteData, keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import { useCallback, useMemo } from 'react';

import { queryKeys } from '@/data/api';
import { useDataInfiniteQuery, useDataQuery } from '@/data/hooks';
import { useDataServices } from '@/data/runtime';
import { imageMediaTypeFromExtension } from '@/data/services/fileStorage';
import type { CursorPaginationResponse } from '@/data/types/apiTypes';
import type { Painting } from '@/data/types/painting';
import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';

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

export type ResolvedPaintingFiles = {
  inputs: ChatInputAttachmentDraft[];
  outputs: { fileEntryId: string; uri: string }[];
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

      const inputEntries = await Promise.all(
        painting.files.input.map(async (fileEntryId) => {
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
        }),
      );
      const outputs = await Promise.all(
        painting.files.output.map(async (fileEntryId) => {
          const uri = await services.fileEntry.resolveUri(fileEntryId);
          return uri ? { fileEntryId, uri } : null;
        }),
      );

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
    // until the new set resolves so the masonry — and the fullscreen viewer that
    // pages across the whole gallery — never blink to empty mid-scroll.
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

export function usePaintingQueryInvalidation() {
  const queryClient = useQueryClient();
  const services = useDataServices();

  return useCallback(
    async (paintingId: string) => {
      const painting = await services.painting.getById(paintingId);
      queryClient.setQueryData(queryKeys.paintings.detail(paintingId), painting);
      await queryClient.invalidateQueries({ queryKey: queryKeys.paintings.all() });
    },
    [queryClient, services.painting],
  );
}
