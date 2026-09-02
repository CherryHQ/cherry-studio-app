import { useState } from 'react';

export type SessionListQuery = {
  error?: Error;
  isLoading: boolean;
};

type SessionListInitialDataOptions = {
  agents: SessionListQuery;
  sessions: SessionListQuery;
};

export function areSessionListQueriesSettled({ agents, sessions }: SessionListInitialDataOptions) {
  return !agents.isLoading && !sessions.isLoading;
}

/**
 * Latches once every initial query has settled (success, empty, or error) so
 * the list mounts exactly once and never unmounts on a later refetch.
 */
export function useSessionListInitialData(options: SessionListInitialDataOptions) {
  const queriesSettled = areSessionListQueriesSettled(options);
  const [hasInitialQueriesSettled, setHasInitialQueriesSettled] = useState(queriesSettled);

  if (queriesSettled && !hasInitialQueriesSettled) {
    setHasInitialQueriesSettled(true);
  }

  return hasInitialQueriesSettled || queriesSettled;
}
