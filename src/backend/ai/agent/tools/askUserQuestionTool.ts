import {
  AgentUserQuestionSchema,
  type AgentUserAnswer,
  type AgentUserQuestion,
} from '@/shared/contracts/agent';

import type { RuntimeTool, RuntimeToolCall } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const ASK_USER_QUESTION_TOOL_NAME = 'ask_user_question';

/**
 * The Host's response channel. The call carries the turn id, so one Host-wide
 * callback can correlate each question to its live turn.
 */
export type AskUserQuestion = (
  question: AgentUserQuestion,
  call: RuntimeToolCall,
) => Promise<AgentUserAnswer>;

export function createAskUserQuestionTool(ask: AskUserQuestion): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: ASK_USER_QUESTION_TOOL_NAME },
    providerName: ASK_USER_QUESTION_TOOL_NAME,
    displayName: 'Ask user',
    description:
      'Resolve a consequential missing preference or decision with one concise question and 2–4 short, distinct options in the user’s language. Each option needs a stable id and a description (empty when unnecessary). Use single for one choice or multiple for several. Free text and skipping are always available. Do not ask for information already provided or routine implementation choices, or substitute questions for tool approval. Ask only one question at a time, never in parallel; wait for the answer before dependent work. Skipping is not consent: proceed only without that decision, or explain what is blocked.',
    inputSchema: toRuntimeInputSchema(AgentUserQuestionSchema),
    approval: 'auto',
    async execute(call) {
      const question = AgentUserQuestionSchema.parse(call.input);
      if (new Set(question.options.map((option) => option.id)).size !== question.options.length) {
        throw new Error('Question option ids must be unique.');
      }
      const answer = await ask(question, call);
      return {
        value: {
          ...answer,
          selectedOptions: question.options.filter((option) =>
            answer.selectedOptionIds.includes(option.id),
          ),
        },
        artifacts: [],
      };
    },
  };
}
