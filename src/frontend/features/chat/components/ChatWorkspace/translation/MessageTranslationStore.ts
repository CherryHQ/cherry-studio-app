import type { ConversationMessage } from '@/frontend/appShell/conversation';
import {
  TranslationError,
  type TranslationErrorCode,
  type TranslationModule,
} from '@/shared/contracts/translation';
import type { ApiClient } from '@/shared/data/api/types';
import type { AppLanguage } from '@/shared/utils/languages';

import {
  messageTranslationSource,
  type MessageTranslationSource,
} from './messageTranslationSource';

export type MessageTranslationState = Readonly<{
  content: string;
  translations: Readonly<Partial<Record<AppLanguage, string>>>;
  language?: AppLanguage;
  visible: boolean;
  status: 'idle' | 'running' | 'success' | 'error' | 'cancelled';
  error?: TranslationErrorCode;
}>;
export const EMPTY_TRANSLATION: MessageTranslationState = {
  content: '',
  translations: {},
  visible: false,
  status: 'idle',
};
type ActiveTranslation = {
  source: MessageTranslationSource;
  controller: AbortController;
  language: AppLanguage;
};

/** Session-owned requests survive row virtualization. Only the translated row is notified. */
export class MessageTranslationStore {
  private states = new Map<string, { contentHash: string; state: MessageTranslationState }>();
  private listeners = new Map<string, Set<() => void>>();
  private active = new Map<string, ActiveTranslation>();

  constructor(
    private readonly translation: TranslationModule,
    private readonly dataApi: Pick<ApiClient, 'patch'>,
    private readonly sessionId: string,
  ) {}

  get(source: MessageTranslationSource): MessageTranslationState {
    const current = this.states.get(source.messageId);
    let state = current?.contentHash === source.contentHash ? current.state : EMPTY_TRANSLATION;
    const saved = source.translations;
    if (saved?.sourceHash === source.contentHash) {
      const languages = Object.keys(saved.results) as AppLanguage[];
      if (languages.some((language) => saved.results[language] && !state.translations[language])) {
        const translations = { ...state.translations };
        let latest: { language: AppLanguage; content: string; createdAt: number } | undefined;
        for (const language of languages) {
          const result = saved.results[language];
          if (!result) continue;
          translations[language] ??= result.content;
          if (!latest || result.createdAt >= latest.createdAt) latest = { language, ...result };
        }
        state =
          state.status === 'idle' && latest
            ? {
                content: latest.content,
                language: latest.language,
                translations,
                visible: false,
                status: 'success',
              }
            : { ...state, translations };
      }
    }
    if (current?.state !== state || current?.contentHash !== source.contentHash)
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
    if (state.status !== 'idle') this.publish(source, { ...state, visible: !state.visible });
  }

  async start(source: MessageTranslationSource, language: AppLanguage) {
    const previous = this.active.get(source.messageId);
    if (previous?.source.contentHash === source.contentHash && previous.language === language) {
      this.publish(source, { ...this.get(source), visible: true });
      return;
    }
    if (previous) this.cancel(source.messageId);
    const state = this.get(source);
    const cached = state.translations[language];
    if (cached) {
      this.publish(source, {
        content: cached,
        translations: state.translations,
        language,
        visible: true,
        status: 'success',
      });
      return;
    }
    const controller = new AbortController();
    const request = { source, controller, language };
    this.active.set(source.messageId, request);
    const isCurrent = () =>
      !controller.signal.aborted && this.active.get(source.messageId) === request;
    this.publish(source, {
      content: '',
      translations: state.translations,
      language,
      visible: true,
      status: 'running',
    });
    try {
      const content = await this.translation.translate(
        { text: source.text, language },
        {
          signal: controller.signal,
          onText: (text) => {
            if (isCurrent())
              this.publish(source, { ...this.get(source), content: text, status: 'running' });
          },
        },
      );
      if (!isCurrent()) return;
      await this.dataApi.patch(
        `/agent-sessions/${this.sessionId}/messages/${source.messageId}/translations`,
        {
          body: { sourceHash: source.contentHash, language, content },
        },
      );
      if (!isCurrent()) return;
      const current = this.get(source);
      this.publish(source, {
        ...current,
        content,
        translations: { ...current.translations, [language]: content },
        status: 'success',
      });
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

  /** Cancel stale work; persisted results stay with the message until its text changes. */
  reconcile(messages: readonly ConversationMessage[]) {
    for (const [messageId, request] of this.active) {
      const message = messages.find((candidate) => candidate.key === messageId);
      const source =
        message?.state === 'success' && message.completeness === 'complete'
          ? messageTranslationSource(message.display)
          : undefined;
      if (source?.contentHash !== request.source.contentHash) this.cancel(messageId);
    }
    for (const message of messages) {
      if (message.state === 'success' || !this.states.has(message.key)) continue;
      this.states.delete(message.key);
      for (const listener of this.listeners.get(message.key) ?? []) listener();
    }
  }
}
