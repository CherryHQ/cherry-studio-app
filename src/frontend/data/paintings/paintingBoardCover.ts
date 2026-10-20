import type { ResolvedFile } from '@/shared/contracts';
import type { Painting } from '@/shared/data/types/painting';

export const PAINTING_BOARD_COVER_CELLS = 4;

export type PaintingBoardCoverCell =
  | { key: string; kind: 'generating' }
  | { key: string; kind: 'image'; uri: string };

export type PaintingBoardCoverContent = {
  cells: PaintingBoardCoverCell[];
  /** Shown on the fourth cell: everything past the first three. Zero below four cells. */
  moreCount: number;
};

/**
 * A board's cover, newest work first: a generation still running holds its
 * place with the loader, finished receipts contribute each of their images,
 * and a receipt that stopped without images is skipped rather than shown as a
 * hole. Empty when nothing on the board has an image or is running.
 */
export function paintingBoardCover(
  recentPaintings: readonly Painting[],
  outputsByPaintingId: ReadonlyMap<string, readonly ResolvedFile[]>,
  activePaintingIds: ReadonlySet<string>,
  imageCount: number,
): PaintingBoardCoverContent {
  const cells: PaintingBoardCoverCell[] = [];
  let running = 0;
  for (const painting of recentPaintings) {
    if (activePaintingIds.has(painting.id)) {
      running += 1;
      cells.push({ key: `${painting.id}:generating`, kind: 'generating' });
    } else {
      for (const output of outputsByPaintingId.get(painting.id) ?? []) {
        cells.push({ key: `${painting.id}:${output.entry.id}`, kind: 'image', uri: output.uri });
      }
    }
  }
  const shown = cells.slice(0, PAINTING_BOARD_COVER_CELLS);
  const leading = PAINTING_BOARD_COVER_CELLS - 1;
  return {
    cells: shown,
    moreCount: shown.length > leading ? imageCount + running - leading : 0,
  };
}
