import * as z from 'zod';

const uniqueIds = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

/** Related mobile-sized questions answered together; free text is always available. */
export const AgentUserQuestionsSchema = z.strictObject({
  questions: z
    .array(
      z.strictObject({
        id: z.string().trim().min(1).max(64),
        question: z.string().trim().min(1).max(300),
        selection: z.enum(['single', 'multiple']),
        options: z
          .array(
            z.strictObject({
              id: z.string().trim().min(1).max(64),
              label: z.string().trim().min(1).max(100),
            }),
          )
          .max(4)
          .refine(uniqueIds, { message: 'Question option ids must be unique.' }),
      }),
    )
    .min(1)
    .max(8)
    .refine(uniqueIds, { message: 'Question ids must be unique.' }),
});
export type AgentUserQuestions = z.infer<typeof AgentUserQuestionsSchema>;
export type AgentUserQuestion = AgentUserQuestions['questions'][number];

export const AgentUserAnswerSchema = z.strictObject({
  questionId: z.string().min(1).max(64),
  selectedOptionIds: z.array(z.string().min(1)).max(4),
  text: z.string().trim().max(4000),
  skipped: z.boolean(),
});
export type AgentUserAnswer = z.infer<typeof AgentUserAnswerSchema>;

export const AgentUserAnswersSchema = z.strictObject({
  answers: z.array(AgentUserAnswerSchema).min(1).max(8),
});
export type AgentUserAnswers = z.infer<typeof AgentUserAnswersSchema>;

export const AgentRespondQuestionSchema = z.strictObject({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  toolCallId: z.string().min(1),
  answer: AgentUserAnswersSchema,
});
export type AgentRespondQuestionInput = z.infer<typeof AgentRespondQuestionSchema>;

function validateUserAnswer(question: AgentUserQuestion, answer: AgentUserAnswer): void {
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

export function validateUserAnswers(request: AgentUserQuestions, response: AgentUserAnswers): void {
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
  question: AgentUserQuestionsSchema,
});
export type AgentPendingQuestion = z.infer<typeof AgentPendingQuestionSchema>;
