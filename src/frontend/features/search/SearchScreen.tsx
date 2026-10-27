import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { ReadingContentFrame } from '@/frontend/appShell/layout';
import {
  cancelScheduledAppSearchFinish,
  finishAppSearchSession,
  getAppSearchSession,
  scheduleAppSearchFinish,
  selectAppSearchItem,
  type AppSearchRequest,
} from '@/frontend/appShell/search';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { AppSearchPanel } from './AppSearchPanel';

type StoredSearchRequest = AppSearchRequest<unknown, unknown, unknown>;
type AppSearchNavigation = {
  addListener: (
    event: 'transitionEnd',
    listener: (event: { data: { closing: boolean } }) => void,
  ) => () => void;
};

export default function SearchScreen() {
  const params = useLocalSearchParams<{ searchSessionId?: string | string[] }>();
  const searchSessionId = getSingleRouteParam(params.searchSessionId);
  const session = getAppSearchSession(searchSessionId);
  const router = useRouter();
  const navigation = useNavigation<AppSearchNavigation>();

  useEffect(() => {
    if (!searchSessionId || !session) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
      return;
    }

    cancelScheduledAppSearchFinish(searchSessionId);
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (event.data.closing) {
        finishAppSearchSession(searchSessionId);
      }
    });

    return () => {
      unsubscribe();
      scheduleAppSearchFinish(searchSessionId);
    };
  }, [navigation, router, searchSessionId, session]);

  if (!searchSessionId || !session) {
    return null;
  }

  return (
    <ReadingContentFrame>
      <AppSearchRoutePage request={session.request} searchSessionId={searchSessionId} />
    </ReadingContentFrame>
  );
}

function AppSearchRoutePage({
  request,
  searchSessionId,
}: {
  request: StoredSearchRequest;
  searchSessionId: string;
}) {
  const router = useRouter();
  const isLeavingRef = useRef(false);
  // A result press always closes the route; the caller acts on the item once the exit finishes.
  const handleSelect = useCallback(
    (item: unknown) => {
      if (isLeavingRef.current) return;
      isLeavingRef.current = true;
      selectAppSearchItem(searchSessionId, item);
      router.back();
    },
    [router, searchSessionId],
  );
  const handleClose = useCallback(() => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    router.back();
  }, [router]);

  return (
    <AppSearchPanel
      onClose={handleClose}
      onSelect={handleSelect}
      // The stored request is erased to unknown; the panel draws it without reading its types.
      request={request as AppSearchRequest<unknown>}
    />
  );
}
