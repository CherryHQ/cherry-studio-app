import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useBackendModule, useQuery } from '@/frontend/data';
import {
  type PaintingJobInterruptionReason,
  paintingJobInterruptionReason,
  usePaintingJobs,
} from '@/frontend/data/paintings/usePaintingJobs';
import { resolvedPaintingFilesQueryOptions } from '@/frontend/data/paintings/usePaintings';
import type { ResolvedPaintingFiles } from '@/shared/contracts';
import type { JobSnapshot } from '@/shared/data/api/schemas/jobs';
import type { Painting, PaintingBoard } from '@/shared/data/types/painting';

import {
  buildPaintingBoardGraph,
  type PaintingBoardGraph,
  type PaintingBoardNodeRef,
} from '../utils/paintingBoardGraph';

export type PaintingBoardImage = { fileEntryId: string; uri: string };

export type PaintingBoardNodeStatus =
  | { kind: 'ready' }
  | { kind: 'generating'; job?: JobSnapshot }
  | { kind: 'stopped'; job?: JobSnapshot; reason: PaintingJobInterruptionReason };

export type PaintingBoardNode = PaintingBoardNodeRef & {
  /** Generated images, or the imported image itself. Empty while generating or after a failure. */
  images: readonly PaintingBoardImage[];
  painting?: Painting;
  status: PaintingBoardNodeStatus;
};

export type PaintingBoardData = {
  board: PaintingBoard | undefined;
  graph: PaintingBoardGraph;
  isLoading: boolean;
  loadError: Error | null;
  nodes: ReadonlyMap<string, PaintingBoardNode>;
  paintings: readonly Painting[];
  refetch(): void;
};

const emptyPaintings: readonly Painting[] = [];

/** Joins the board's paintings with their resolved files and live job state. */
export function usePaintingBoard(boardId: string | undefined): PaintingBoardData {
  const paintingsBackend = useBackendModule('paintings');
  const enabled = Boolean(boardId);
  const boardQuery = useQuery('/painting-boards/:id', {
    enabled,
    params: { id: boardId ?? '' },
  });
  const paintingsQuery = useQuery('/painting-boards/:id/paintings', {
    enabled,
    params: { id: boardId ?? '' },
  });
  const paintings = paintingsQuery.data ?? emptyPaintings;
  const jobs = usePaintingJobs();
  const files = useQueries({
    queries: paintings.map((painting) =>
      resolvedPaintingFilesQueryOptions(paintingsBackend, painting),
    ),
    combine: (results) => results.map((result) => result.data),
  });
  const graph = useMemo(() => buildPaintingBoardGraph(paintings), [paintings]);

  const nodes = useMemo(() => {
    const byPaintingId = new Map(paintings.map((painting, index) => [painting.id, index]));
    const uris = new Map<string, string>();
    for (const resolved of files) {
      for (const file of [...(resolved?.inputs ?? []), ...(resolved?.outputs ?? [])]) {
        uris.set(file.entry.id, file.uri);
      }
    }
    const result = new Map<string, PaintingBoardNode>();
    for (const ref of graph.nodes) {
      if (ref.kind === 'import') {
        const uri = uris.get(ref.fileEntryId);
        result.set(ref.id, {
          ...ref,
          images: uri ? [{ fileEntryId: ref.fileEntryId, uri }] : [],
          status: { kind: 'ready' },
        });
        continue;
      }
      const index = byPaintingId.get(ref.paintingId) ?? -1;
      const painting = paintings[index];
      if (!painting) continue;
      result.set(ref.id, {
        ...ref,
        images: outputImages(painting, files[index]),
        painting,
        status: nodeStatus(painting, jobs),
      });
    }
    return result;
  }, [files, graph, jobs, paintings]);

  return {
    board: boardQuery.data,
    graph,
    isLoading: enabled && (boardQuery.isLoading || paintingsQuery.isLoading),
    loadError: boardQuery.error ?? paintingsQuery.error ?? null,
    nodes,
    paintings,
    refetch: () => {
      void boardQuery.refetch();
      void paintingsQuery.refetch();
    },
  };
}

function outputImages(
  painting: Painting,
  resolved: ResolvedPaintingFiles | undefined,
): PaintingBoardImage[] {
  const uris = new Map(resolved?.outputs.map((file) => [file.entry.id, file.uri]));
  return painting.files.output.flatMap((fileEntryId) => {
    const uri = uris.get(fileEntryId);
    return uri ? [{ fileEntryId, uri }] : [];
  });
}

/**
 * A receipt without images is generating while its job runs and stopped
 * otherwise. Until the active job list has loaded, every such receipt reads as
 * generating so a running generation never flashes a failure.
 */
function nodeStatus(
  painting: Painting,
  jobs: ReturnType<typeof usePaintingJobs>,
): PaintingBoardNodeStatus {
  if (painting.files.output.length > 0) return { kind: 'ready' };
  const active = jobs.activeByPaintingId.get(painting.id);
  if (active || jobs.isLoading) return { kind: 'generating', job: active };
  const interrupted = jobs.interruptedByPaintingId.get(painting.id);
  return { kind: 'stopped', job: interrupted, reason: paintingJobInterruptionReason(interrupted) };
}
