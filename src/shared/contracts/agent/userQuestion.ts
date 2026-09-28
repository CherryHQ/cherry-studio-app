import * as z from 'zod';

/** Legacy single-question input remains readable in existing tool calls and history. */
export const AgentUserQuestionSchema = z.strictObject({
  question: z.string().trim().min(1).max(300),
  selection: z.enum(['single', 'multiple']),
  options: z
    .array(
      z.strictObject({
        id: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(100),
        description: z.string().trim().max(200),
      }),
    )
    .min(2)
    .max(4),
});
export type AgentUserQuestion = z.infer<typeof AgentUserQuestionSchema>;

export const AgentUserQuestionsSchema = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        id: z.string().trim().min(1).max(64),
        question: AgentUserQuestionSchema.shape.question,
        selection: AgentUserQuestionSchema.shape.selection,
        options: z
          .array(AgentUserQuestionSchema.shape.options.element.omit({ description: true }))
          .max(4)
          .refine(
            (options) => new Set(options.map((option) => option.id)).size === options.length,
            {
              message: 'Question option ids must be unique.',
            },
          ),
      }),
    )
    .min(1)
    .max(8)
    .refine(
      (questions) => new Set(questions.map((question) => question.id)).size === questions.length,
      {
        message: 'Question ids must be unique.',
      },
    ),
});
export type AgentUserQuestions = z.infer<typeof AgentUserQuestionsSchema>;

export const AgentUserQuestionRequestSchema = z.union([
  AgentUserQuestionsSchema,
  AgentUserQuestionSchema,
]);
export type AgentUserQuestionRequest = z.infer<typeof AgentUserQuestionRequestSchema>;

export function getUserQuestions(
  request: AgentUserQuestionRequest,
): AgentUserQuestions['questions'] {
  return 'questions' in request ? request.questions : [{ ...request, id: 'question-1' }];
}

export const AgentUserAnswerSchema = z.strictObject({
  selectedOptionIds: z.array(z.string().min(1)).max(4),
  text: z.string().trim().max(4000),
  skipped: z.boolean(),
});
export type AgentUserAnswer = z.infer<typeof AgentUserAnswerSchema>;

export const AgentUserAnswersSchema = z.strictObject({
  answers: z
    .array(AgentUserAnswerSchema.extend({ questionId: z.string().min(1).max(64) }))
    .min(1)
    .max(8),
});
export type AgentUserAnswers = z.infer<typeof AgentUserAnswersSchema>;

export const AgentUserResponseSchema = z.union([AgentUserAnswersSchema, AgentUserAnswerSchema]);
export type AgentUserResponse = z.infer<typeof AgentUserResponseSchema>;

export const AgentRespondQuestionSchema = z.strictObject({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  toolCallId: z.string().min(1),
  answer: AgentUserResponseSchema,
});
export type AgentRespondQuestionInput = z.infer<typeof AgentRespondQuestionSchema>;

export function validateUserAnswer(
  question: AgentUserQuestions['questions'][number] | AgentUserQuestion,
  answer: AgentUserAnswer,
): void {
  const ids = new Set(answer.selectedOptionIds);
  if (
    ids.size !== answer.selectedOptionIds.length ||
    [...ids].some((id) => !question.options.some((option) => option.id === id)) ||
    (question.selection === 'single' && ids.size > 1) ||
    (answer.skipped
      ? ids.size > 0 || Boolean(answer.text.trim())
      : ids.size === 0 && !answer.text.trim())
  ) {
    throw new Error('Invalid answer for this question.');
  }
}

export function validateUserResponse(
  request: AgentUserQuestionRequest,
  response: AgentUserResponse,
): void {
  if (!('questions' in request) && !('answers' in response)) {
    validateUserAnswer(request, response);
    return;
  }
  if (!('questions' in request) || !('answers' in response)) {
    throw new Error('The answer does not match the question format.');
  }
  const answers = new Map(response.answers.map((answer) => [answer.questionId, answer]));
  if (answers.size !== response.answers.length || answers.size !== request.questions.length) {
    throw new Error('Answer or explicitly skip every question exactly once.');
  }
  for (const question of request.questions) {
    const answer = answers.get(question.id);
    if (!answer) throw new Error('Missing answer for this question.');
    validateUserAnswer(question, answer);
  }
}

export const AgentPendingQuestionSchema = z.strictObject({
  turnId: z.string().min(1),
  toolCallId: z.string().min(1),
  question: AgentUserQuestionRequestSchema,
});
export type AgentPendingQuestion = z.infer<typeof AgentPendingQuestionSchema>;
