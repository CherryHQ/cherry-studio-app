import type { ResolvedPaintingFiles } from '@/frontend/data/paintings/usePaintings';
import type { Painting } from '@/shared/data/types/painting';

export type PaintingOpenState = 'loading' | 'loadFailed' | 'unavailable' | 'ready';

/**
 * What the screen shows while it opens a persisted painting. `ready` means the
 * composer can mount with the painting's files as its initial state. A handoff
 * seeds the composer itself, so only the painting row has to load then.
 * Loading outranks a stale error so a retry shows progress, and data outranks
 * a refetch error so what loaded once stays open.
 */
export function paintingOpenState(input: {
  files: ResolvedPaintingFiles | undefined;
  filesError: unknown;
  hasHandoff: boolean;
  isFilesLoading: boolean;
  isPaintingLoading: boolean;
  painting: Painting | undefined;
  paintingError: unknown;
}): PaintingOpenState {
  if (input.isPaintingLoading || input.isFilesLoading) return 'loading';
  if (!input.painting) return input.paintingError ? 'loadFailed' : 'unavailable';
  if (input.hasHandoff) return 'ready';
  if (!input.files) return input.filesError ? 'loadFailed' : 'loading';
  if (input.painting.files.output.length > 0 && input.files.outputs.length === 0) {
    return 'unavailable';
  }
  return 'ready';
}
