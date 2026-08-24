import { router } from 'expo-router';

import { createAppSearchSession, finishAppSearchSession } from './appSearchSession';
import type { AppSearchOutcome, AppSearchRequest } from './types';

async function open<TItem, TFilters = undefined, TFilterContext = undefined>(
  request: AppSearchRequest<TItem, TFilters, TFilterContext>,
): Promise<AppSearchOutcome<TItem>> {
  const { outcome, sessionId } = createAppSearchSession(request);

  if (!sessionId) {
    return outcome;
  }

  try {
    router.push({ params: { sessionId }, pathname: '/search' });
  } catch {
    finishAppSearchSession(sessionId);
  }

  return outcome;
}

const appSearchActions = { open } as const;

/** Stable app-shell action; query text and results stay local to the search route. */
export function useAppSearch() {
  return appSearchActions;
}
