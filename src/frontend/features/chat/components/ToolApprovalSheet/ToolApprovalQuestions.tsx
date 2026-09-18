import { Input, Section, SelectionIndicator } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export type ToolApprovalQuestion = {
  question: string;
  header?: string;
  multiple: boolean;
  options: readonly { label: string; description?: string }[];
};

export type ToolApprovalAnswer = { selected: readonly string[]; freeText: string };

export function formatToolApprovalAnswer(answer?: ToolApprovalAnswer): string {
  return answer
    ? [...answer.selected, ...(answer.freeText.trim() ? [answer.freeText.trim()] : [])].join(', ')
    : '';
}

export function ToolApprovalQuestions({
  questions,
  answers,
  disabled,
  onAnswer,
}: {
  questions: readonly ToolApprovalQuestion[];
  answers: Readonly<Record<string, ToolApprovalAnswer>>;
  disabled: boolean;
  onAnswer(question: string, answer: ToolApprovalAnswer): void;
}) {
  return questions.map((question) => (
    <Question
      key={question.question}
      question={question}
      answer={answers[question.question]}
      disabled={disabled}
      onAnswer={(answer) => onAnswer(question.question, answer)}
    />
  ));
}

function Question({
  question,
  answer,
  disabled,
  onAnswer,
}: {
  question: ToolApprovalQuestion;
  answer?: ToolApprovalAnswer;
  disabled: boolean;
  onAnswer(answer: ToolApprovalAnswer): void;
}) {
  const { t } = useTranslation();
  const selected = answer?.selected ?? [];
  const freeText = answer?.freeText ?? '';
  const select = (label: string) => {
    if (disabled) return;
    const next = question.multiple
      ? selected.includes(label)
        ? selected.filter((value) => value !== label)
        : [...selected, label]
      : [label];
    onAnswer({ selected: next, freeText: question.multiple ? freeText : '' });
  };

  return (
    <View className="gap-2">
      {question.header ? (
        <Text className="text-foreground-tertiary text-xs">{question.header}</Text>
      ) : null}
      <Text className="font-medium text-base text-foreground">{question.question}</Text>
      <Section>
        {question.options.map((option) =>
          question.multiple ? (
            <Section.Item
              key={option.label}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected.includes(option.label) }}
              label={option.label}
              description={option.description}
              disabled={disabled}
              onPress={() => select(option.label)}
              showChevron={false}
              trailing={<SelectionIndicator selected={selected.includes(option.label)} />}
            />
          ) : (
            <Section.RadioItem
              key={option.label}
              label={option.label}
              description={option.description}
              disabled={disabled}
              selected={selected.includes(option.label)}
              onPress={() => select(option.label)}
            />
          ),
        )}
      </Section>
      <Input
        accessibilityLabel={t('remoteAgent.freeAnswer')}
        placeholder={t('remoteAgent.freeAnswer')}
        value={freeText}
        editable={!disabled}
        multiline
        onChangeText={(text) => {
          if (disabled) return;
          onAnswer({ selected: question.multiple ? selected : [], freeText: text });
        }}
      />
    </View>
  );
}
