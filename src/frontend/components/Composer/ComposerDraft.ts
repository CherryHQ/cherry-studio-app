import type { SetStateAction } from 'react';

import {
  type ComposerAttachmentDraft,
  type ComposerInitialAttachment,
  isComposerAttachmentReady,
} from './utils/composerAttachments';

/** Synchronous so an async completion can update the same buffer a remounted editor reads. */
export function createComposerValue<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(value, next)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export class ComposerDraft {
  readonly text;
  readonly attachments;
  readonly failedSend = createComposerValue<{ error: unknown; attemptId: number } | undefined>(
    undefined,
  );
  readonly submitting = createComposerValue(false);
  readonly imports = new Map<string, symbol>();
  private nextAttemptId = 0;

  constructor(initialText = '', initialAttachments: readonly ComposerInitialAttachment[] = []) {
    this.text = createComposerValue(initialText);
    this.attachments = createComposerValue<ComposerAttachmentDraft[]>(
      initialAttachments.map((item) =>
        isComposerAttachmentReady(item) ? item : { ...item, status: 'importing' },
      ),
    );
  }

  setText = (next: SetStateAction<string>) => {
    this.text.set(typeof next === 'function' ? next(this.text.get()) : next);
  };

  beginSend = () => {
    if (this.submitting.get()) return null;
    this.submitting.set(true);
    return ++this.nextAttemptId;
  };

  endSend = () => this.submitting.set(false);
}
