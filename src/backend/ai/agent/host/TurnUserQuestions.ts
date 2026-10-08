import {
  type AgentUserAnswers,
  type AgentUserQuestions,
  validateUserAnswers,
} from '@/shared/contracts/agent';

import type { RuntimeToolCall } from '../runtime';

/** Waiting callbacks live only as long as their turn; messages own durable questions/results. */
export class TurnUserQuestions {
  private pending = new Map<
    string,
    { question: AgentUserQuestions; resolve: (answer: AgentUserAnswers) => void }
  >();

  ask(
    question: AgentUserQuestions,
    { toolCallId, signal }: RuntimeToolCall,
  ): Promise<AgentUserAnswers> {
    signal.throwIfAborted();
    if (this.pending.size) throw new Error('Wait for the current question before asking another.');
    return new Promise((resolve, reject) => {
      const abort = () => {
        this.pending.delete(toolCallId);
        reject(signal.reason);
      };
      this.pending.set(toolCallId, {
        question,
        resolve: (answer) => {
          signal.removeEventListener('abort', abort);
          this.pending.delete(toolCallId);
          resolve(answer);
        },
      });
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  respond(toolCallId: string, answer: AgentUserAnswers): void {
    const pending = this.pending.get(toolCallId);
    if (!pending) throw new Error('This question is no longer waiting for an answer.');
    validateUserAnswers(pending.question, answer);
    pending.resolve(answer);
  }
}
