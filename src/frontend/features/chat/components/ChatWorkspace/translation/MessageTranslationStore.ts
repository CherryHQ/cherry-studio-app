import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type { CacheService } from '@/frontend/data/CacheService';
import {
  TranslationError,
  type TranslationErrorCode,
  type TranslationModule,
} from '@/shared/contracts/translation';
import type { AppLanguage } from '@/shared/utils/languages';

import {
  messageTranslationSource,
  type MessageTranslationSource,
} from './messageTranslationSource';

export type MessageTranslationState = Readonly<{
  content: string;
  visible: boolean;
  status: 'idle' | 'running' | 'success' | 'error' | 'cancelled';
  error?: TranslationErrorCode;
}>;
export const EMPTY_TRANSLATION: MessageTranslationState = {
  content: '',
  visible: false,
  status: 'idle',
};
// Reading aids are recoverable; keep the most recently generated 100 results across all chats.
const MAX_SAVED_TRANSLATIONS = 100;

type ActiveTranslation = { source: MessageTranslationSource; controller: AbortController };

/** Session-owned requests survive row virtualization. Only the translated row is notified. */
export class MessageTranslationStore {
  private states = new Map<string, { contentHash: string; state: MessageTranslationState }>();
  private listeners = new Map<string, Set<() => void>>();
  private active = new Map<string, ActiveTranslation>();

  constructor(
    private readonly translation: TranslationModule,
    private readonly cache: Pick<CacheService, 'getPersist' | 'setPersist'>,
    private readonly scope: string,
    private readonly sessionId: string,
    readonly language: AppLanguage,
  ) {}

  private cacheKey(messageId: string) {
    // Earlier entries may contain output saved before truncation was checked.
    return JSON.stringify([2, this.scope, this.sessionId, messageId, this.language]);
  }

  get(source: MessageTranslationSource): MessageTranslationState {
    const current = this.states.get(source.messageId);
    if (current?.contentHash === source.contentHash) return current.state;
    const saved = this.cache.getPersist('chat.translations')[this.cacheKey(source.messageId)];
    const state: MessageTranslationState =
      saved?.contentHash === source.contentHash &&
      typeof saved.content === 'string' &&
      saved.content.trim()
        ? { content: saved.content, status: 'success', visible: true }
        : EMPTY_TRANSLATION;
    this.states.set(source.messageId, { contentHash: source.contentHash, state });
    return state;
  }

  subscribe(messageId: string, listener: () => void) {
    const listeners = this.listeners.get(messageId) ?? new Set();
    listeners.add(listener);
    this.listeners.set(messageId, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(messageId);
    };
  }

  private publish(source: MessageTranslationSource, state: MessageTranslationState) {
    this.states.set(source.messageId, { contentHash: source.contentHash, state });
    for (const listener of this.listeners.get(source.messageId) ?? []) listener();
  }

  toggle(source: MessageTranslationSource) {
    const state = this.get(source);
    if (state.status === 'idle') void this.start(source);
    else this.publish(source, { ...state, visible: !state.visible });
  }

  async start(source: MessageTranslationSource) {
    const previous = this.active.get(source.messageId);
    if (previous?.source.contentHash === source.contentHash) return;
    if (previous) this.cancel(source.messageId);
    const controller = new AbortController();
    const request = { source, controller };
    this.active.set(source.messageId, request);
    const isCurrent = () =>
      !controller.signal.aborted && this.active.get(source.messageId) === request;
    this.publish(source, { content: '', visible: true, status: 'running' });
    try {
      const content = await this.translation.translate(
        { text: source.text, language: this.language },
        {
          signal: controller.signal,
          onText: (text) => {
            if (isCurrent())
              this.publish(source, { ...this.get(source), content: text, status: 'running' });
          },
        },
      );
      if (!isCurrent()) return;
      if (!content.trim()) throw new TranslationError('failed', 'Empty translation.');
      const saved = { ...this.cache.getPersist('chat.translations') };
      const key = this.cacheKey(source.messageId);
      delete saved[key];
      saved[key] = { contentHash: source.contentHash, content };
      const keys = Object.keys(saved);
      for (const oldKey of keys.slice(0, Math.max(0, keys.length - MAX_SAVED_TRANSLATIONS)))
        delete saved[oldKey];
      this.cache.setPersist('chat.translations', saved);
      this.publish(source, { ...this.get(source), content, status: 'success' });
    } catch (error) {
      if (!isCurrent()) return;
      this.publish(source, {
        ...this.get(source),
        status: 'error',
        error: error instanceof TranslationError ? error.code : 'failed',
      });
    } finally {
      if (this.active.get(source.messageId) === request) this.active.delete(source.messageId);
    }
  }

  cancel(messageId: string) {
    const request = this.active.get(messageId);
    if (!request) return;
    this.active.delete(messageId);
    request.controller.abort();
    this.publish(request.source, { ...this.get(request.source), status: 'cancelled' });
  }

  cancelAll() {
    for (const messageId of this.active.keys()) this.cancel(messageId);
  }

  /** A removed, retried or changed answer must not accept a late translation. */
  reconcile(messages: readonly ConversationMessage[]) {
    for (const [messageId, request] of this.active) {
      const message = messages.find((candidate) => candidate.key === messageId);
      const source =
        message?.state === 'success' && message.completeness === 'complete'
          ? messageTranslationSource(message.display)
          : undefined;
      if (source?.contentHash !== request.source.contentHash) this.cancel(messageId);
    }
    // A retry can reuse the message ID. Invalidate saved text as soon as that answer
    // starts changing, even if it eventually regenerates exactly the same words.
    for (const message of messages) {
      if (message.state === 'success' || !this.states.has(message.key)) continue;
      this.states.delete(message.key);
      const saved = { ...this.cache.getPersist('chat.translations') };
      const key = this.cacheKey(message.key);
      if (key in saved) {
        delete saved[key];
        this.cache.setPersist('chat.translations', saved);
      }
      for (const listener of this.listeners.get(message.key) ?? []) listener();
    }
  }
}
