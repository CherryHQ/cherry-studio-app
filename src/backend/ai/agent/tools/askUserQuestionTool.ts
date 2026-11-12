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
      'Ask 1–8 concise, related questions in the user’s language for consequential missing decisions. Use unique stable ids and at most 4 short options per question; options: [] allows free text only. Use single for one choice, multiple for several. Free text and skipping are always available. Batch related questions in one call, never parallel calls, and wait before dependent work. Do not ask for known information, routine choices or tool approval. Skipping is not consent: continue only without that decision or explain the block.',
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
