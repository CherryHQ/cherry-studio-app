import type { ResolvedFile } from '@/shared/contracts';
import type { Painting } from '@/shared/data/types/painting';

export const PAINTING_BOARD_COVER_CELLS = 3;

export type PaintingBoardCoverCell =
  | { key: string; kind: 'generating' }
  | { key: string; kind: 'image'; uri: string };

/**
 * A board's cover, newest work first: a generation still running holds its
 * place with the loader, finished receipts contribute each of their images,
 * and a receipt that stopped without images is skipped rather than shown as a
 * hole. Empty when nothing on the board has an image or is running.
 */
export function paintingBoardCoverCells(
  recentPaintings: readonly Painting[],
  outputsByPaintingId: ReadonlyMap<string, readonly ResolvedFile[]>,
  activePaintingIds: ReadonlySet<string>,
): PaintingBoardCoverCell[] {
  const cells: PaintingBoardCoverCell[] = [];
  for (const painting of recentPaintings) {
    if (activePaintingIds.has(painting.id)) {
      cells.push({ key: `${painting.id}:generating`, kind: 'generating' });
    } else {
      for (const output of outputsByPaintingId.get(painting.id) ?? []) {
        cells.push({ key: `${painting.id}:${output.entry.id}`, kind: 'image', uri: output.uri });
      }
    }
    if (cells.length >= PAINTING_BOARD_COVER_CELLS) break;
  }
  return cells.slice(0, PAINTING_BOARD_COVER_CELLS);
}
