import { getChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import { ComposerDraft, createComposerValue } from '@/frontend/components/Composer/ComposerDraft';
import type { ComposerInitialAttachment } from '@/frontend/components/Composer/utils/composerAttachments';

import type { QuoteState } from '../quotes/ChatQuoteContext';
import type { createPendingChatMessages } from './agentMessageProjection';

export type PendingChatSend = Readonly<{
  sessionId: string;
  isNewSession: boolean;
  messages: ReturnType<typeof createPendingChatMessages>;
}>;

type ChatSubmission = {
  userMessageId: string;
  isSubmitting: boolean;
  selectedMessageId?: string | null;
  send?: PendingChatSend;
};

export type ComposerSeed = {
  initialDraft?: string;
  initialAttachments?: readonly ComposerInitialAttachment[];
  seedHandoff?: string;
};

/** A local conversation owns its input and the message awaiting durable admission. */
class ChatComposer {
  readonly draft: ComposerDraft;
  readonly quote = createComposerValue<QuoteState>({ fields: {}, isBusy: false });
  readonly submission = createComposerValue<ChatSubmission | undefined>(undefined);
  handoffToken?: string;
  private views = 0;

  constructor(seed: ComposerSeed) {
    this.draft = new ComposerDraft(seed.initialDraft, seed.initialAttachments);
    this.handoffToken = seed.seedHandoff;
  }

  mount() {
    this.views++;
    return () => {
      this.views--;
      // An admitted send can be reconstructed from the Host when the next view subscribes.
      if (!this.views && !this.submission.get()?.isSubmitting) this.submission.set(undefined);
    };
  }

  finish(userMessageId: string, accepted: boolean) {
    const current = this.submission.get();
    if (current?.userMessageId === userMessageId) {
      this.submission.set({
        ...current,
        isSubmitting: false,
        send: accepted && this.views ? current.send : undefined,
      });
    }
  }

  acknowledge = (userMessageId: string) => {
    const current = this.submission.get();
    if (current?.userMessageId === userMessageId && current.send) {
      this.submission.set({ ...current, send: undefined });
    }
  };

  get canRelease() {
    return (
      !this.views &&
      !this.draft.text.get() &&
      !this.draft.attachments.get().length &&
      !this.draft.submitting.get() &&
      !this.draft.failedSend.get() &&
      !this.submission.get()?.isSubmitting &&
      !getChatComposerHandoff(this.handoffToken)
    );
  }
}

/** Drop empty, unobserved buffers on navigation, including sends that settled off screen. */
export class ChatComposers extends Map<string, ChatComposer> {
  peek(sessionId: string | undefined): ChatComposer | undefined {
    return sessionId ? this.get(sessionId) : undefined;
  }

  create(seed: ComposerSeed): ChatComposer {
    return new ChatComposer(seed);
  }

  attach(sessionId: string | undefined, composer: ChatComposer): () => void {
    if (sessionId && !this.has(sessionId)) this.set(sessionId, composer);
    for (const [id, entry] of this) {
      if (id !== sessionId && entry.canRelease) this.delete(id);
    }
    return () => {
      if (sessionId && this.get(sessionId) === composer && composer.canRelease) {
        this.delete(sessionId);
      }
    };
  }
}
