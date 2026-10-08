import {
  AgentUserQuestionsSchema,
  type AgentUserAnswers,
  type AgentUserQuestions,
} from '@/shared/contracts/agent';

import type { RuntimeTool, RuntimeToolCall } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const ASK_USER_QUESTION_TOOL_NAME = 'ask_user_question';

/**
 * The Host's response channel. The call carries the turn id, so one Host-wide
 * callback can correlate each question to its live turn.
 */
export type AskUserQuestion = (
  question: AgentUserQuestions,
  call: RuntimeToolCall,
) => Promise<AgentUserAnswers>;

export function createAskUserQuestionTool(ask: AskUserQuestion): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: ASK_USER_QUESTION_TOOL_NAME },
    providerName: ASK_USER_QUESTION_TOOL_NAME,
    displayName: 'Ask user',
    description:
      'Resolve consequential missing preferences or decisions with 1–8 related, concise questions in the user’s language. Give every question a unique stable id. Each question has up to 4 options, each only a unique stable id and a short label; use an empty options array for free text only. Use single for one choice or multiple for several. Free text and skipping are always available. The user reviews and submits all answers together, associated by questionId. Do not ask for information already provided or routine implementation choices, or substitute questions for tool approval. Send related questions in one call, never parallel calls; wait for the answers before dependent work. Skipping is not consent: proceed only without that decision, or explain what is blocked.',
    inputSchema: toRuntimeInputSchema(AgentUserQuestionsSchema),
    approval: 'auto',
    async execute(call) {
      const question = AgentUserQuestionsSchema.parse(call.input);
      // The Host validates the answers against this exact request before resolving.
      const answer = await ask(question, call);
      return {
        value: {
          ...answer,
          selectedOptions: answer.answers.map((item) => ({
            questionId: item.questionId,
            options: question.questions
              .find(({ id }) => id === item.questionId)!
              .options.filter((option) => item.selectedOptionIds.includes(option.id)),
          })),
        },
        artifacts: [],
      };
    },
  };
}
