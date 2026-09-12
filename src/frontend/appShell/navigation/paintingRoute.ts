import { getSingleRouteParam } from '@/frontend/utils/routeParams';

/** A new edit owns its draft; its source painting is not the task it will create. */
export function paintingRouteId(params?: {
  handoff?: string | string[];
  paintingId?: string | string[];
}): string | undefined {
  const handoff = getSingleRouteParam(params?.handoff);
  if (handoff) return `draft:${handoff}`;
  const paintingId = getSingleRouteParam(params?.paintingId);
  return paintingId ? `painting:${paintingId}` : undefined;
}
