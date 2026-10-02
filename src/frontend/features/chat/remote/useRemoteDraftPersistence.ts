import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { cacheService } from '@/frontend/data/CacheService';

const DRAFT_PERSIST_DELAY_MS = 500;

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (pending) writeRemoteDraft(pending.key, pending.text);
    pending = undefined;
  };
  return {
    flush,
    schedule(key: string, text: string) {
      pending = { key, text };
      clearTimeout(timer);
      timer = setTimeout(flush, DRAFT_PERSIST_DELAY_MS);
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
