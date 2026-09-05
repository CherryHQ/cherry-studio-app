import { Redirect, useLocalSearchParams } from 'expo-router';

import { getSingleRouteParam } from '@/frontend/utils/routeParams';

export function PaintingConversationScreen() {
  const params = useLocalSearchParams<{ paintingId?: string | string[] }>();
  const paintingId = getSingleRouteParam(params.paintingId);

  return (
    <Redirect
      href={
        paintingId ? { pathname: '/paintings', params: { paintingId } } : { pathname: '/paintings' }
      }
    />
  );
}
