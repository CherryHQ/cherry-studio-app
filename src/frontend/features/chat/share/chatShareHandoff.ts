import { randomUUID } from 'expo-crypto';

import type { AppLanguage } from '@/shared/utils/languages';

/** The current text of each expanded translation at the moment sharing opens. */
export type ChatShareTranslations = Readonly<
  Record<
    string,
    { readonly sourceHash: string; readonly language: AppLanguage; readonly content: string }
  >
>;

/** One pending share handoff; message text never enters URLs or saved navigation state. */
let current: { token: string; sessionId: string; translations: ChatShareTranslations } | undefined;

export function createChatShareHandoff(
  sessionId: string,
  translations: ChatShareTranslations | undefined,
): string | undefined {
  current = undefined;
  if (!translations || !Object.keys(translations).length) return undefined;
  const token = randomUUID();
  current = { token, sessionId, translations };
  return token;
}

export function getChatShareHandoff(
  token: string | undefined,
  sessionId: string,
): ChatShareTranslations | undefined {
  return token && current?.token === token && current.sessionId === sessionId
    ? current.translations
    : undefined;
}
