import * as z from 'zod';

/** One mobile-sized question per call; free text is always available. */
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

export const AgentUserAnswerSchema = z.strictObject({
  selectedOptionIds: z.array(z.string().min(1)).max(4),
  text: z.string().trim().max(4000),
  skipped: z.boolean(),
});
export type AgentUserAnswer = z.infer<typeof AgentUserAnswerSchema>;

export const AgentRespondQuestionSchema = z.strictObject({
  sessionId: z.string().min(1),
  turnId: z.string().min(1),
  toolCallId: z.string().min(1),
  answer: AgentUserAnswerSchema,
});
export type AgentRespondQuestionInput = z.infer<typeof AgentRespondQuestionSchema>;

export function validateUserAnswer(question: AgentUserQuestion, answer: AgentUserAnswer): void {
  const ids = new Set(answer.selectedOptionIds);
  if (
    ids.size !== answer.selectedOptionIds.length ||
    [...ids].some((id) => !question.options.some((option) => option.id === id)) ||
    (question.selection === 'single' && ids.size > 1) ||
    (answer.skipped ? ids.size > 0 || Boolean(answer.text) : ids.size === 0 && !answer.text)
  ) {
    throw new Error('Invalid answer for this question.');
  }
}

export const AgentPendingQuestionSchema = z.strictObject({
  turnId: z.string().min(1),
  toolCallId: z.string().min(1),
  question: AgentUserQuestionSchema,
});
export type AgentPendingQuestion = z.infer<typeof AgentPendingQuestionSchema>;
