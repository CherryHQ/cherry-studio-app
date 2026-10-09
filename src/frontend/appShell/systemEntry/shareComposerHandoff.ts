import { randomUUID } from 'expo-crypto';

import type { ComposerInitialAttachment } from '@/frontend/components/Composer/utils/composerAttachments';

export type ShareComposerHandoff = {
  attachments: readonly ComposerInitialAttachment[];
  draft: string;
};

/**
 * One slot, because the newest share owns the composer. Route params carry only the token; shared
 * text and file paths never enter a URL or saved navigation state.
 */
let current: { handoff: ShareComposerHandoff; token: string } | undefined;

export function createShareComposerHandoff(handoff: ShareComposerHandoff): string {
  const token = randomUUID();
  current = { handoff, token };
  return token;
}

/** Stays readable while its token is the current one, so a remount seeds the same composer. */
export function getShareComposerHandoff(
  token: string | undefined,
): ShareComposerHandoff | undefined {
  return token && current?.token === token ? current.handoff : undefined;
}
