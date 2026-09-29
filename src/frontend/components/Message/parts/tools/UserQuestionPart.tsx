import { ContextMenuExclusion } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  AgentUserAnswersSchema,
  AgentUserQuestionsSchema,
  validateUserAnswers,
  type AgentUserAnswers,
} from '@/shared/contracts/agent';

import { GenericToolPart } from './GenericToolPart';
import type { ToolMessagePart } from './toolPartState';

/** A flat transcript record of each question and its answer; the live form is the chat's sheet. */
export function UserQuestionPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const parsed = AgentUserQuestionsSchema.safeParse(part.input);
  if (!parsed.success) return <GenericToolPart part={part} />;
  const request = parsed.data;
  const { questions } = request;
  const output =
    part.state === 'output-available' && typeof part.output === 'object' && part.output !== null
      ? (part.output as Record<string, unknown>)
      : undefined;
  const result = output ? AgentUserAnswersSchema.safeParse({ answers: output.answers }) : undefined;
  let response: AgentUserAnswers | undefined;
  if (result?.success) {
    try {
      validateUserAnswers(request, result.data);
      response = result.data;
    } catch {
      // An invalid persisted result must not appear as a completed answer.
    }
  }
  const answers = response?.answers ?? [];
  const statusText = t(
    part.state === 'input-available' ? 'chat.question.waiting' : 'chat.question.closed',
  );

  return (
    <ContextMenuExclusion className="w-full gap-3" testID="user-question-part">
      {questions.map((question) => {
        const answer = answers.find((item) => item.questionId === question.id);
        const answerText =
          answer && !answer.skipped
            ? [
                ...question.options
                  .filter((option) => answer.selectedOptionIds.includes(option.id))
                  .map((option) => option.label),
                answer.text,
              ]
                .filter(Boolean)
                .join('\n')
            : undefined;
        return (
          <View key={question.id} className="gap-1">
            <Text className="text-foreground-tertiary text-sm" selectable>
              {question.question}
            </Text>
            {answerText ? (
              <Text className="text-base text-foreground" selectable>
                {answerText}
              </Text>
            ) : (
              <Text className="text-foreground-tertiary text-base">
                {answer?.skipped ? t('chat.question.skipped') : statusText}
              </Text>
            )}
          </View>
        );
      })}
    </ContextMenuExclusion>
  );
}
