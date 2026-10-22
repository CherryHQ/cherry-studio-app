import { randomUUID } from 'expo-crypto';

import type {
  ComposerAttachmentReady,
  ComposerInitialAttachment,
} from '@/frontend/components/Composer/utils/composerAttachments';
import type { OfficeSelection } from '@/shared/data/types/selectionReference';
import type { SkillAction } from '@/shared/data/types/skill';

export type ChatComposerHandoff = {
  attachments: readonly ComposerInitialAttachment[];
  draft: string;
  skillAction?: SkillAction;
  /** An Office preview selection the composer shows as a chip ahead of the draft. */
  selection?: { label: string; selection: OfficeSelection };
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

type ChatSelectionHandoff = {
  attachment: ComposerAttachmentReady;
  selection: NonNullable<ChatComposerHandoff['selection']>;
};

// Appending a selection must not replace the entry action that seeded the current draft.
let pendingSelection: { token: string; handoff: ChatSelectionHandoff } | undefined;

export function createChatSelectionHandoff(handoff: ChatSelectionHandoff): string {
  const token = randomUUID();
  pendingSelection = { token, handoff };
  return token;
}

/** Consumed once after the source chat regains focus, including across effect remounts. */
export function takeChatSelectionHandoff(token: string | undefined) {
  if (!token || pendingSelection?.token !== token) return;
  const { handoff } = pendingSelection;
  pendingSelection = undefined;
  return handoff;
}
