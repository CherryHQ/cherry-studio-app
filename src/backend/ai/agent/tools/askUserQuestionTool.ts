import {
  AgentUserQuestionRequestSchema,
  AgentUserQuestionsSchema,
  getUserQuestions,
  validateUserResponse,
  type AgentUserResponse,
  type AgentUserQuestionRequest,
} from '@/shared/contracts/agent';

import type { RuntimeTool, RuntimeToolCall } from '../runtime';
import { toRuntimeInputSchema } from './runtimeToolSchema';

export const ASK_USER_QUESTION_TOOL_NAME = 'ask_user_question';

/**
 * The Host's response channel. The call carries the turn id, so one Host-wide
 * callback can correlate each question to its live turn.
 */
export type AskUserQuestion = (
  question: AgentUserQuestionRequest,
  call: RuntimeToolCall,
) => Promise<AgentUserResponse>;

export function createAskUserQuestionTool(ask: AskUserQuestion): RuntimeTool {
  return {
    ref: { source: 'builtin', capabilityId: ASK_USER_QUESTION_TOOL_NAME },
    providerName: ASK_USER_QUESTION_TOOL_NAME,
    displayName: 'Ask user',
    description:
      'Resolve consequential missing preferences or decisions with 1–8 related, concise questions in the user’s language. Give every question a unique stable id. Each question has up to 4 short options with unique stable ids and labels; use an empty options array for free text only. Use single for one choice or multiple for several. Avoid explanatory option descriptions. Free text and skipping are always available. The user reviews and submits all answers together, associated by questionId. Do not ask for information already provided or routine implementation choices, or substitute questions for tool approval. Send related questions in one call, never parallel calls; wait for the answers before dependent work. Skipping is not consent: proceed only without that decision, or explain what is blocked.',
    inputSchema: toRuntimeInputSchema(AgentUserQuestionsSchema),
    approval: 'auto',
    async execute(call) {
      const question = AgentUserQuestionRequestSchema.parse(call.input);
      const questions = getUserQuestions(question);
      if (
        questions.some(
          (item) => new Set(item.options.map((option) => option.id)).size !== item.options.length,
        )
      ) {
        throw new Error('Question option ids must be unique.');
      }
      const answer = await ask(question, call);
      validateUserResponse(question, answer);
      return {
        value: {
          ...answer,
          selectedOptions:
            'answers' in answer
              ? answer.answers.map((item) => ({
                  questionId: item.questionId,
                  options: questions
                    .find((question) => question.id === item.questionId)!
                    .options.filter((option) => item.selectedOptionIds.includes(option.id)),
                }))
              : questions[0].options.filter((option) =>
                  answer.selectedOptionIds.includes(option.id),
                ),
        },
        artifacts: [],
      };
    },
  };
}
