import type { AppSearchOutcome, AppSearchRequest } from './types';

type AppSearchSession<TItem, TFilters, TFilterContext> = {
  id: string;
  pendingOutcome?: AppSearchOutcome<TItem>;
  request: AppSearchRequest<TItem, TFilters, TFilterContext>;
  resolve: (outcome: AppSearchOutcome<TItem>) => void;
};

type StoredAppSearchSession = AppSearchSession<unknown, unknown, unknown>;

let activeSessionId: string | undefined;
let nextSessionNumber = 1;
const sessions = new Map<string, StoredAppSearchSession>();

export function createAppSearchSession<TItem, TFilters, TFilterContext>(
  request: AppSearchRequest<TItem, TFilters, TFilterContext>,
): {
  outcome: Promise<AppSearchOutcome<TItem>>;
  sessionId?: string;
} {
  if (activeSessionId) {
    return { outcome: Promise.resolve({ type: 'cancelled' }) };
  }

  const sessionId = `app-search-${Date.now()}-${nextSessionNumber++}`;
  let resolveOutcome: (outcome: AppSearchOutcome<TItem>) => void = () => {};
  const outcome = new Promise<AppSearchOutcome<TItem>>((resolve) => {
    resolveOutcome = resolve;
  });
  const session: AppSearchSession<TItem, TFilters, TFilterContext> = {
    id: sessionId,
    request,
    resolve: resolveOutcome,
  };

  activeSessionId = sessionId;
  // Generic request functions are intentionally erased only inside this
  // in-memory registry; `create` keeps the promise returned to the caller typed.
  sessions.set(sessionId, session as unknown as StoredAppSearchSession);

  return { outcome, sessionId };
}

export function getAppSearchSession(sessionId: string | undefined) {
  return sessionId ? sessions.get(sessionId) : undefined;
}

export function selectAppSearchItem(sessionId: string, item: unknown) {
  const session = sessions.get(sessionId);

  if (session && !session.pendingOutcome) {
    session.pendingOutcome = { item, type: 'selected' };
  }
}

/** Resolve only once the native stack has finished removing the search route. */
export function finishAppSearchSession(sessionId: string) {
  const session = sessions.get(sessionId);

  if (!session) {
    return;
  }

  sessions.delete(sessionId);
  if (activeSessionId === sessionId) {
    activeSessionId = undefined;
  }
  session.resolve(session.pendingOutcome ?? { type: 'cancelled' });
}
