import { ContextMenuExclusion, MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  AgentUserQuestionRequestSchema,
  AgentUserResponseSchema,
  getUserQuestions,
  validateUserResponse,
  type AgentUserResponse,
} from '@/shared/contracts/agent';

import { GenericToolPart } from './GenericToolPart';
import type { ToolMessagePart } from './toolPartState';

/** Historical record only. The live response surface belongs to the chat composer. */
export function UserQuestionPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const parsed = AgentUserQuestionRequestSchema.safeParse(part.input);
  if (!parsed.success) return <GenericToolPart part={part} />;
  const request = parsed.data;
  const questions = getUserQuestions(request);
  const output =
    part.state === 'output-available' && typeof part.output === 'object' && part.output !== null
      ? (part.output as Record<string, unknown>)
      : undefined;
  const result = output
    ? AgentUserResponseSchema.safeParse(
        'questions' in request
          ? { answers: output.answers }
          : {
              selectedOptionIds: output.selectedOptionIds,
              text: output.text,
              skipped: output.skipped,
            },
      )
    : undefined;
  let response: AgentUserResponse | undefined;
  if (result?.success) {
    try {
      validateUserResponse(request, result.data);
      response = result.data;
    } catch {
      // An invalid persisted result must not appear as a completed answer.
    }
  }
  const answers = response
    ? 'answers' in response
      ? response.answers
      : [{ ...response, questionId: questions[0].id }]
    : [];
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
