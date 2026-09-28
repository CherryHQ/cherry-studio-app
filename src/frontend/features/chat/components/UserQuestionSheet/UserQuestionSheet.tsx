import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { BottomSheet, Button, Input } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardController } from 'react-native-keyboard-controller';

import { useComposerPresentationActions } from '@/frontend/components/Composer';

import { type UserQuestionFormProps, useUserQuestionForm } from './useUserQuestionForm';

const ignoreClose = () => undefined;

export type UserQuestionSheetProps = UserQuestionFormProps & { open: boolean };

/** Asks one question at a time; the request stays on screen until it is answered. */
export function UserQuestionSheet({ open, ...props }: UserQuestionSheetProps) {
  const { t } = useTranslation();
  const form = useUserQuestionForm(props);
  const { dismissInput } = useComposerPresentationActions();
  useEffect(() => {
    if (!open) return;
    // The sheet covers the chat input, so its editing session and keyboard end here.
    dismissInput();
    void KeyboardController.dismiss();
  }, [dismissInput, open]);
  const total = form.questions.length;
  const actionLabel = t(
    form.action === 'submit'
      ? 'chat.question.submit'
      : form.action === 'next'
        ? 'chat.question.next'
        : 'chat.question.skip',
  );

  return (
    <BottomSheet
      dismissible={false}
      footer={
        <View className="flex-row gap-3">
          {total > 1 ? (
            <View className="flex-1">
              <Button
                disabled={form.locked || form.index === 0}
                onPress={() => form.navigate(form.index - 1)}
                testID="user-question-previous"
                variant="secondary"
              >
                <Button.Label>{t('chat.question.previous')}</Button.Label>
              </Button>
            </View>
          ) : null}
          <View className="flex-1">
            <Button
              disabled={form.locked || !form.canAct}
              loading={form.busy}
              onPress={form.advance}
              testID="user-question-action"
              variant={form.action === 'skip' ? 'secondary' : 'default'}
            >
              <Button.Label>{actionLabel}</Button.Label>
            </Button>
          </View>
        </View>
      }
      headerAction={
        total > 1 ? (
          <Text
            accessibilityLabel={t('chat.question.progressLabel', {
              current: form.index + 1,
              total,
            })}
            accessibilityLiveRegion="polite"
            className="text-foreground-tertiary text-sm"
          >
            {t('chat.question.progress', { current: form.index + 1, total })}
          </Text>
        ) : undefined
      }
      onClose={ignoreClose}
      open={open}
      size="medium"
      testID="user-question-sheet"
      title={t('chat.question.title')}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.page}>
        <ScrollView
          key={form.question.id}
          className="min-h-0 flex-1"
          contentContainerClassName="gap-4 px-5 pt-2 pb-4"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-1">
            {form.question.header ? (
              <Text className="text-foreground-tertiary text-sm">{form.question.header}</Text>
            ) : null}
            <Text accessibilityRole="header" className="font-semibold text-base text-foreground">
              {form.question.question}
            </Text>
            {form.question.selection === 'multiple' && form.question.options.length > 0 ? (
              <Text className="text-foreground-tertiary text-xs">
                {t('chat.question.multiple')}
              </Text>
            ) : null}
          </View>
          {form.question.options.length ? (
            <View className="-mx-3 gap-1">
              {form.question.options.map((option) => {
                const selected = form.answer.selectedOptionIds.includes(option.id);
                return (
                  <Pressable
                    key={option.id}
                    accessibilityLabel={option.label}
                    accessibilityHint={option.description}
                    accessibilityRole={
                      form.question.selection === 'multiple' ? 'checkbox' : 'radio'
                    }
                    accessibilityState={{ checked: selected, disabled: form.locked }}
                    className={`min-h-11 flex-row items-center gap-2 rounded-lg px-3 py-2 active:opacity-70 ${selected ? 'bg-secondary' : ''}`}
                    disabled={form.locked}
                    onPress={() => form.select(option.id)}
                  >
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-base text-foreground">{option.label}</Text>
                      {option.description ? (
                        <Text className="text-foreground-tertiary text-sm">
                          {option.description}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <CheckIcon className="size-5 text-foreground" />
                    ) : (
                      <View className="size-5" />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <Input
            accessibilityLabel={t('chat.question.custom')}
            disabled={form.locked}
            maxLength={4000}
            onChangeText={form.setText}
            onSubmitEditing={form.advance}
            placeholder={t('chat.question.custom')}
            returnKeyType={form.action === 'submit' ? 'done' : 'next'}
            testID="user-question-custom"
            value={form.answer.text}
          />
          {form.answer.skipped ? (
            <Text className="text-foreground-tertiary text-sm">{t('chat.question.skipped')}</Text>
          ) : null}
          {form.failed ? (
            <Text accessibilityRole="alert" className="text-sm text-error">
              {t('chat.question.failed')}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
