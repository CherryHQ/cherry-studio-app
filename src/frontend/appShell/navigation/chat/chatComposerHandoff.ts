import { randomUUID } from 'expo-crypto';

import type { ComposerInitialAttachment } from '@/frontend/components/Composer/utils/composerAttachments';

export type ChatComposerHandoff = {
  attachments: readonly ComposerInitialAttachment[];
  draft: string;
  skillAction?: 'find-and-install';
};

/**
 * One slot, because the newest entry action owns the composer. Route params carry only the token; shared
 * text and file paths never enter a URL or saved navigation state.
 */
let current: { handoff: ChatComposerHandoff; token: string } | undefined;

export function createChatComposerHandoff(handoff: ChatComposerHandoff): string {
  const token = randomUUID();
  current = { handoff, token };
  return token;
}

/** Stays readable while its token is the current one, so a remount seeds the same composer. */
export function getChatComposerHandoff(token: string | undefined): ChatComposerHandoff | undefined {
  return token && current?.token === token ? current.handoff : undefined;
}
