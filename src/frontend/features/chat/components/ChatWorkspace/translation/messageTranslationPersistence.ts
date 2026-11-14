import { cacheService, type CacheService } from '@/frontend/data/CacheService';
import type { ApiClient } from '@/shared/data/api/types';
import {
  readMessageTranslations,
  type MessageTranslations,
} from '@/shared/data/types/messageTranslation';
import type { AppLanguage } from '@/shared/utils/languages';
import { sha256HexOfText } from '@/shared/utils/sha256';

import type { MessageTranslationSource } from './messageTranslationSource';

export type MessageTranslationPersistence = {
  read?(source: MessageTranslationSource): MessageTranslations | undefined;
  save(source: MessageTranslationSource, language: AppLanguage, content: string): Promise<void>;
};

export function localMessageTranslationPersistence(
  api: Pick<ApiClient, 'patch'>,
  sessionId: string,
): MessageTranslationPersistence {
  return {
    async save(source, language, content) {
      await api.patch(`/agent-sessions/${sessionId}/messages/${source.messageId}/translations`, {
        body: { sourceHash: source.contentHash, language, content },
      });
    },
  };
}

const CACHE_KEY = 'remote_agent.translations';
const MAX_ENTRIES = 200;
const MAX_CHARACTERS = 2_000_000;

/** Recoverable phone-owned reading aids, never desktop transcript mutations. */
export function remoteMessageTranslationPersistence(
  scope: string,
  cache: Pick<CacheService, 'getPersist' | 'setPersist'> = cacheService,
): MessageTranslationPersistence {
  const key = (source: MessageTranslationSource) =>
    sha256HexOfText(JSON.stringify([scope, source.messageId, source.revision, source.contentHash]));
  const entries = () => {
    const value = cache.getPersist(CACHE_KEY);
    return value && typeof value === 'object' ? value : {};
  };
  return {
    read: (source) => readMessageTranslations(entries()[key(source)]),
    async save(source, language, content) {
      const id = key(source);
      const saved = readMessageTranslations(entries()[id]);
      const result: MessageTranslations = {
        sourceHash: source.contentHash,
        results: {
          ...(saved?.sourceHash === source.contentHash ? saved.results : {}),
          [language]: { content, createdAt: Date.now() },
        },
      };
      const candidates = Object.entries({ ...entries(), [id]: result })
        .flatMap(([id, value]) => {
          const item = readMessageTranslations(value);
          return item
            ? [
                {
                  id,
                  value: item,
                  createdAt: Math.max(
                    ...Object.values(item.results).map((result) => result?.createdAt ?? 0),
                  ),
                },
              ]
            : [];
        })
        .sort((left, right) =>
          left.id === id ? -1 : right.id === id ? 1 : right.createdAt - left.createdAt,
        );
      const retained: Record<string, MessageTranslations> = {};
      let characters = 0;
      for (const entry of candidates.slice(0, MAX_ENTRIES)) {
        const size = JSON.stringify(entry.value).length;
        if (characters + size > MAX_CHARACTERS) continue;
        retained[entry.id] = entry.value;
        characters += size;
      }
      cache.setPersist(CACHE_KEY, retained);
    },
  };
}
