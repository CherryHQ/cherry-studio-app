import {
  AgentUserQuestionSchema,
  type AgentUserAnswer,
  type AgentUserQuestion,
} from '@/shared/contracts/agent';

import type { RuntimeTool, RuntimeToolCall } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const ASK_USER_QUESTION_TOOL_NAME = 'ask_user_question';
type AskUser = (question: AgentUserQuestion, call: RuntimeToolCall) => Promise<AgentUserAnswer>;

/** The Host binds the turn-local response channel immediately before execution. */
export function createAskUserQuestionTool(ask?: AskUser): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: ASK_USER_QUESTION_TOOL_NAME },
    providerName: ASK_USER_QUESTION_TOOL_NAME,
    displayName: 'Ask user',
    description:
      'Ask one concise question when a user decision materially changes the task. Supply 2–4 short options in the user’s language, each with a stable id and optional explanation (empty string allowed). Use single for one choice or multiple for several. Free text and skipping are always available. Wait for the returned answer before continuing. Do not ask for information already provided, routine implementation choices, or duplicate tool approvals. Ask only one question at a time, never in parallel.',
    inputSchema: toRuntimeInputSchema(AgentUserQuestionSchema),
    approval: 'auto',
    interaction: 'user-input',
    async execute(call) {
      const question = AgentUserQuestionSchema.parse(call.input);
      if (new Set(question.options.map((option) => option.id)).size !== question.options.length) {
        throw new Error('Question option ids must be unique.');
      }
      if (!ask) throw new Error('The question response channel is unavailable.');
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
