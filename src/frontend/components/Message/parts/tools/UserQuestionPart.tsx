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
  return (
    <View className="w-full gap-3 rounded-2xl bg-card p-4">
      <Text accessibilityRole="header" className="font-semibold text-foreground text-lg">
        {question.question}
      </Text>
      <Text className="text-muted-foreground text-base" selectable>
        {answer
          ? answer.skipped
            ? t('chat.question.skipped')
            : [
                ...question.options
                  .filter((option) => answer.selectedOptionIds.includes(option.id))
                  .map((option) => option.label),
                answer.text,
              ]
                .filter(Boolean)
                .join(' · ')
          : t(waiting ? 'chat.question.waiting' : 'chat.question.closed')}
      </Text>
    </View>
  );
}
