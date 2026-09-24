import { ContextMenuExclusion, MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { AgentUserAnswerSchema, AgentUserQuestionSchema } from '@/shared/contracts/agent';

import { GenericToolPart } from './GenericToolPart';
import type { ToolMessagePart } from './toolPartState';

/** Historical record only. The live response surface belongs to the chat sheet. */
export function UserQuestionPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const parsed = AgentUserQuestionSchema.safeParse(part.input);
  if (!parsed.success) return <GenericToolPart part={part} />;
  const question = parsed.data;
  const output =
    part.state === 'output-available' && typeof part.output === 'object' && part.output !== null
      ? (part.output as Record<string, unknown>)
      : undefined;
  const result = output
    ? AgentUserAnswerSchema.safeParse({
        selectedOptionIds: output.selectedOptionIds,
        text: output.text,
        skipped: output.skipped,
      })
    : undefined;
  const answer = result?.success ? result.data : undefined;
  const waiting = part.state === 'input-available';
  const statusText = t(
    answer
      ? answer.skipped
        ? 'chat.question.skipped'
        : 'common.done'
      : waiting
        ? 'chat.question.waiting'
        : 'chat.question.closed',
  );
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
    <ContextMenuExclusion>
      <MessagePart.Tool
        detailTitle={t('chat.question.title')}
        state={waiting ? 'running' : 'complete'}
        statusText={statusText}
        testID="user-question-part"
        title={question.question}
        titleAnimation="none"
      >
        <View className="gap-4">
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
              {statusText}
            </Text>
          )}
        </View>
      </MessagePart.Tool>
    </ContextMenuExclusion>
  );
}
