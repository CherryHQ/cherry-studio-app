import { BottomSheet, Button, Input, SelectionIndicator } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AgentPendingQuestion, AgentUserAnswer } from '@/shared/contracts/agent';

const ignoreClose = () => undefined;

type UserQuestionSheetProps = {
  request: AgentPendingQuestion | null;
  isOpen: boolean;
  onRespond(toolCallId: string, answer: AgentUserAnswer): Promise<void>;
  onCancel(): Promise<void>;
};

export function UserQuestionSheet({
  request,
  isOpen,
  onRespond,
  onCancel,
}: UserQuestionSheetProps) {
  const { t } = useTranslation();
  // Preserve content during the native close animation, like ToolApprovalSheet.
  const [lastRequest, setLastRequest] = useState(request);
  if (
    request &&
    (request.toolCallId !== lastRequest?.toolCallId || request.turnId !== lastRequest?.turnId)
  ) {
    setLastRequest(request);
  }
  const current = request ?? lastRequest;
  if (!current) return null;
  return (
    <BottomSheet
      dismissible={false}
      onClose={ignoreClose}
      open={isOpen}
      size="large"
      testID="user-question-sheet"
      title={t('chat.question.title')}
    >
      <QuestionForm
        key={`${current.turnId}:${current.toolCallId}`}
        request={current}
        disabled={!isOpen || !request}
        onCancel={onCancel}
        onRespond={onRespond}
      />
    </BottomSheet>
  );
}

function QuestionForm({
  request,
  disabled,
  onRespond,
  onCancel,
}: Omit<UserQuestionSheetProps, 'request' | 'isOpen'> & {
  request: AgentPendingQuestion;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const submitting = useRef(false);
  const { bottom } = useSafeAreaInsets();
  const { question, toolCallId } = request;
  const isMultiple = question.selection === 'multiple';

  async function submit(answer: AgentUserAnswer | 'stop') {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setFailed(false);
    Keyboard.dismiss();
    try {
      if (answer === 'stop') await onCancel();
      else await onRespond(toolCallId, answer);
      // Keep controls locked until the Host removes this request.
    } catch {
      submitting.current = false;
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <Text accessibilityRole="header" className="font-semibold text-foreground text-lg">
          {question.question}
        </Text>
        <Text className="text-muted-foreground text-sm">
          {t(isMultiple ? 'chat.question.multiple' : 'chat.question.single')}
        </Text>
        <View className="gap-2">
          {question.options.map((option) => (
            <QuestionOption
              key={option.id}
              option={option}
              isSelected={selected.includes(option.id)}
              isMultiple={isMultiple}
              disabled={disabled || busy}
              onPress={() => {
                if (submitting.current) return;
                if (isMultiple)
                  setSelected((current) =>
                    current.includes(option.id)
                      ? current.filter((id) => id !== option.id)
                      : [...current, option.id],
                  );
                else {
                  setSelected([option.id]);
                  void submit({
                    selectedOptionIds: [option.id],
                    text: text.trim(),
                    skipped: false,
                  });
                }
              }}
            />
          ))}
        </View>
        <Input
          accessibilityLabel={t('chat.question.custom')}
          disabled={disabled || busy}
          maxLength={4000}
          multiline
          onChangeText={setText}
          placeholder={t('chat.question.custom')}
          value={text}
        />
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: Math.max(16, bottom) }]}>
        {isMultiple || text.trim() || busy ? (
          <Button
            disabled={disabled || busy || (!selected.length && !text.trim())}
            loading={busy}
            onPress={() =>
              void submit({
                selectedOptionIds: isMultiple ? selected : [],
                text: text.trim(),
                skipped: false,
              })
            }
          >
            {t('chat.question.continue')}
          </Button>
        ) : null}
        {failed ? (
          <Text accessibilityRole="alert" className="text-error text-sm">
            {t('chat.question.failed')}
          </Text>
        ) : null}
        <View className="gap-2">
          <Button
            disabled={disabled || busy}
            onPress={() => void submit({ selectedOptionIds: [], text: '', skipped: true })}
            variant="secondary"
          >
            {t('chat.question.skip')}
          </Button>
          <Button disabled={disabled || busy} onPress={() => void submit('stop')} variant="ghost">
            {t('chat.input.action.stopGenerating')}
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function QuestionOption({
  option,
  isSelected,
  isMultiple,
  disabled,
  onPress,
}: {
  option: AgentPendingQuestion['question']['options'][number];
  isSelected: boolean;
  isMultiple: boolean;
  disabled: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={option.label}
      accessibilityHint={option.description}
      accessibilityRole={isMultiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: isSelected, disabled }}
      className={`min-h-14 flex-row items-center gap-3 rounded-xl border p-3 ${isSelected ? 'border-primary bg-primary/10' : 'border-border bg-background'} active:opacity-70`}
      disabled={disabled}
      onPress={onPress}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-medium text-foreground text-base">{option.label}</Text>
        {option.description ? (
          <Text className="text-muted-foreground text-sm">{option.description}</Text>
        ) : null}
      </View>
      <SelectionIndicator selected={isSelected} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { gap: 12, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  actions: { gap: 12, paddingHorizontal: 24, paddingTop: 12 },
});
