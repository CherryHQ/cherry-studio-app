import { useState } from 'react';

import { usePersistCache } from '@/frontend/data';

import {
  SESSION_WEB_SEARCH_SELECTION_CACHE_KEY,
  updateSessionWebSearchSelection,
} from '../../sessionWebSearchSelection';

type DraftSelection = {
  agentId?: string;
  isEnabled: boolean;
  sessionId?: string;
};

const DEFAULT_WEB_SEARCH_ENABLED = true;

/**
 * Stores established Session selections in the frontend persist cache while
 * keeping the not-yet-created Session selection local to this composer.
 */
export function useChatInputWebSearchSelection(input: { agentId?: string; sessionId?: string }) {
  const { agentId, sessionId } = input;
  const [enabledSessionIds, setEnabledSessionIds] = usePersistCache(
    SESSION_WEB_SEARCH_SELECTION_CACHE_KEY,
  );
  const [draftSelection, setDraftSelection] = useState<DraftSelection>({
    agentId,
    isEnabled: DEFAULT_WEB_SEARCH_ENABLED,
    sessionId,
  });
  let activeDraftSelection = draftSelection;
  if (draftSelection.agentId !== agentId || draftSelection.sessionId !== sessionId) {
    activeDraftSelection = {
      agentId,
      isEnabled: DEFAULT_WEB_SEARCH_ENABLED,
      sessionId,
    };
    setDraftSelection(activeDraftSelection);
  }

  const isWebSearchEnabled = sessionId
    ? enabledSessionIds.includes(sessionId)
    : activeDraftSelection.isEnabled;

  const setIsWebSearchEnabled = (isEnabled: boolean) => {
    if (sessionId) {
      setEnabledSessionIds((current) =>
        updateSessionWebSearchSelection(current, sessionId, isEnabled),
      );
      return;
    }

    setDraftSelection({ agentId, isEnabled, sessionId });
  };

  return { isWebSearchEnabled, setIsWebSearchEnabled };
}
