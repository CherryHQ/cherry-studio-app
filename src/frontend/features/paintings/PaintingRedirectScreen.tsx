import { Redirect, useLocalSearchParams } from 'expo-router';

import { getSingleRouteParam } from '@/frontend/utils/routeParams';

/**
 * Released builds linked a painting's image viewer (`/paintings/<id>`) and its
 * conversation (`/paintings/<id>/conversation`); both now open the board,
 * focused on that painting.
 */
export function PaintingRedirectScreen() {
  const params = useLocalSearchParams<{
    fileEntryId?: string | string[];
    paintingId?: string | string[];
  }>();
  const paintingId = getSingleRouteParam(params.paintingId);
  const fileEntryId = getSingleRouteParam(params.fileEntryId);

  return (
    <Redirect
      href={
        paintingId
          ? {
              pathname: '/paintings',
              params: { paintingId, ...(fileEntryId ? { fileEntryId } : {}) },
            }
          : { pathname: '/paintings' }
      }
    />
  );
}
