import { ContextMenuExclusion, MessagePart } from '@cherrystudio/ui/components';
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

/** Historical record only. The live response surface belongs to the chat composer. */
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
  const waiting = part.state === 'input-available';
  const statusText = t(
    response
      ? answers.every((answer) => answer.skipped)
        ? 'chat.question.skipped'
        : 'common.done'
      : waiting
        ? 'chat.question.waiting'
        : 'chat.question.closed',
  );

  return (
    <ContextMenuExclusion>
      <MessagePart.Tool
        detailTitle={t('chat.question.title')}
        state={waiting ? 'running' : 'complete'}
        statusText={statusText}
        testID="user-question-part"
        title={questions.length === 1 ? questions[0].question : t('chat.question.title')}
        titleAnimation="none"
      >
        <View className="gap-4">
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
                    .join('\n\n')
                : undefined;
            return (
              <View key={question.id} className="gap-2">
                <Text
                  accessibilityRole="header"
                  className="font-semibold text-base text-foreground"
                  selectable
                >
                  {question.question}
                </Text>
                {answerText ? (
                  <MessagePart.TextSection title={t('chat.tool.response')} value={answerText} />
                ) : (
                  <Text className="text-foreground-tertiary text-sm" selectable>
                    {answer?.skipped ? t('chat.question.skipped') : statusText}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </MessagePart.Tool>
    </ContextMenuExclusion>
  );
}
