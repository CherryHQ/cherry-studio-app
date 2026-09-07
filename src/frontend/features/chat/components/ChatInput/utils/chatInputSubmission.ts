import { v7 as uuidv7 } from 'uuid';

import type { AgentSubmitMessageInput } from '@/shared/contracts/agent';

/** One identity per attempted payload; a rejected send can safely retry it. */
export function createChatInputSubmission() {
  let pending: { fingerprint: string; inputId: string } | undefined;

  return {
    identify(input: Omit<AgentSubmitMessageInput, 'inputId'>): string {
      const fingerprint = JSON.stringify(input);
      if (pending?.fingerprint !== fingerprint) {
        pending = { fingerprint, inputId: uuidv7() };
      }
      return pending.inputId;
    },
    accept(inputId: string) {
      if (pending?.inputId === inputId) {
        pending = undefined;
      }
    },
  };
}
