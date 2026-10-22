import { getSingleRouteParam } from '@/frontend/utils/routeParams';

/** Reopening the board or task already on top reuses its page instead of stacking a copy. */
export function paintingRouteId(params?: {
  boardId?: string | string[];
  paintingId?: string | string[];
}): string | undefined {
  const boardId = getSingleRouteParam(params?.boardId);
  if (boardId) return `board:${boardId}`;
  const paintingId = getSingleRouteParam(params?.paintingId);
  return paintingId ? `painting:${paintingId}` : undefined;
}
