import { cacheService } from '@/frontend/data/CacheService';

export const SESSION_WEB_SEARCH_SELECTION_CACHE_KEY =
  'chat.web_search.enabled_session_ids' as const;

export function updateSessionWebSearchSelection(
  enabledSessionIds: readonly string[],
  sessionId: string,
  isEnabled: boolean,
): readonly string[] {
  const alreadyEnabled = enabledSessionIds.includes(sessionId);
  if (alreadyEnabled === isEnabled) {
    return enabledSessionIds;
  }

  return isEnabled
    ? [...enabledSessionIds, sessionId]
    : enabledSessionIds.filter((candidate) => candidate !== sessionId);
}

export function persistSessionWebSearchSelection(sessionId: string, isEnabled: boolean): void {
  const enabledSessionIds = cacheService.getPersist(SESSION_WEB_SEARCH_SELECTION_CACHE_KEY);
  cacheService.setPersist(
    SESSION_WEB_SEARCH_SELECTION_CACHE_KEY,
    updateSessionWebSearchSelection(enabledSessionIds, sessionId, isEnabled),
  );
}
