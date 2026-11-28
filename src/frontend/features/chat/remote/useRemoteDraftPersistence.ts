import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { usePersistCache } from '@/frontend/data';
import { cacheService } from '@/frontend/data/CacheService';
import { createDebouncedAction } from '@/frontend/utils/scheduling';
import type { RemoteModelOption } from '@/shared/contracts/remoteAgent';

const DRAFT_PERSIST_DELAY_MS = 500;

export function useRemoteDraftModel(key: string, agentId?: string) {
  const [selections, setSelections] = usePersistCache('remote_agent.draft_models');
  const saved = selections[key];
  const setModel = useCallback(
    (model?: RemoteModelOption) => {
      if (!agentId) return;
      setSelections((current) => {
        if (model) return { ...current, [key]: { agentId, model } };
        if (current[key]?.agentId !== agentId) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    [key, agentId, setSelections],
  );
  return { model: saved && saved.agentId === agentId ? saved.model : undefined, setModel };
}

/** Reads a saved draft without subscribing, so typing does not re-render the chat screen. */
export function readRemoteDraft(key: string): string {
  return cacheService.getPersist('remote_agent.drafts')[key] ?? '';
}

function writeRemoteDraft(key: string, text: string) {
  const drafts = cacheService.getPersist('remote_agent.drafts');
  if (drafts[key] !== text)
    cacheService.setPersist('remote_agent.drafts', { ...drafts, [key]: text });
}

function createDraftWriter() {
  let pending: { key: string; text: string } | undefined;
  const action = createDebouncedAction(() => {
    if (pending) writeRemoteDraft(pending.key, pending.text);
    pending = undefined;
  }, DRAFT_PERSIST_DELAY_MS);
  return {
    flush: action.flush,
    schedule(key: string, text: string) {
      pending = { key, text };
      action.schedule();
    },
  };
}

/**
 * Saves the composer text once typing pauses: each save serializes every draft into the store.
 * Leaving the draft, switching to another key, or backgrounding the app saves pending text at once.
 */
export function useRemoteDraftPersistence(key: string, text: string) {
  const [writer] = useState(createDraftWriter);
  useEffect(() => {
    writer.schedule(key, text);
  }, [writer, key, text]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') writer.flush();
    });
    return () => {
      subscription.remove();
      writer.flush();
    };
  }, [writer, key]);
}
