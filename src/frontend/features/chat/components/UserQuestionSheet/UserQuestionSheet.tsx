import { BottomSheet, Button, Input, SelectionIndicator } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useComposerPresentationActions } from '@/frontend/components/Composer';

import { type UserQuestionFormProps, useUserQuestionForm } from './useUserQuestionForm';

const ignoreClose = () => undefined;

export type UserQuestionSheetProps = UserQuestionFormProps & { open: boolean };

/** Asks one question at a time and retains drafts while its owner hides the request. */
export function UserQuestionSheet({ open, ...props }: UserQuestionSheetProps) {
  const { t } = useTranslation();
  const form = useUserQuestionForm(props);
  const { dismissInput } = useComposerPresentationActions();
  useEffect(() => {
    if (!open) return;
    // The sheet covers the chat input, so its editing session and keyboard end here.
    dismissInput();
    void KeyboardController.dismiss();
    // Closing, whether answered or behind an approval, drops the keyboard of the sheet's field.
    return () => void KeyboardController.dismiss();
  }, [dismissInput, open]);
  const total = form.questions.length;
  const actionLabel = t(
    form.action === 'submit'
      ? 'chat.question.submit'
      : form.action === 'next'
        ? 'chat.question.next'
        : 'chat.question.skip',
  );
  const actionVariant = form.action === 'skip' ? 'secondary' : 'default';
  const advance = () => {
    // Submitting ends typing at once rather than when the answered sheet closes.
    if (form.action === 'submit') void KeyboardController.dismiss();
    form.advance();
  };

  return (
    <BottomSheet
      avoidKeyboard
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
            {/* Remount on a variant change: switching the mounted button from secondary to
                default in place left its label invisible on iOS. */}
            <Button
              key={actionVariant}
              disabled={form.locked || !form.canAct}
              loading={form.busy}
              onPress={advance}
              testID="user-question-action"
              variant={actionVariant}
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
      <ScrollView
        key={form.question.id}
        className="min-h-0 flex-1"
        contentContainerClassName="gap-4 px-5 pt-2 pb-4"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {form.question.header ? (
          <Text className="text-foreground-tertiary text-sm">{form.question.header}</Text>
        ) : null}
        <Text accessibilityRole="header" className="font-semibold text-base text-foreground">
          {form.question.question}
        </Text>
        {form.question.options.length ? (
          <View className="-mx-3 gap-1">
            {form.question.options.map((option) => {
              const selected = form.answer.selectedOptionIds.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityLabel={option.label}
                  accessibilityHint={option.description}
                  accessibilityRole={form.question.selection === 'multiple' ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: selected, disabled: form.locked }}
                  className={`min-h-11 flex-row items-center gap-3 rounded-lg px-3 py-2 active:opacity-70 ${selected ? 'bg-secondary' : ''}`}
                  disabled={form.locked}
                  onPress={() => form.select(option.id)}
                >
                  <SelectionIndicator
                    control={form.question.selection === 'multiple' ? 'checkbox' : 'radio'}
                    selected={selected}
                  />
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-base text-foreground">{option.label}</Text>
                    {option.description ? (
                      <Text className="text-foreground-tertiary text-sm">{option.description}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {form.answer.skipped ? (
          <Text className="text-foreground-tertiary text-sm">{t('chat.question.skipped')}</Text>
        ) : null}
        {form.failed ? (
          <Text accessibilityRole="alert" className="text-sm text-error">
            {t('chat.question.failed')}
          </Text>
        ) : null}
      </ScrollView>
      {/* Outside the scroll view, so the keyboard shrinks the options instead of hiding it. */}
      <View className="px-5 pb-3">
        <Input
          accessibilityLabel={t('chat.question.custom')}
          disabled={form.locked}
          maxLength={4000}
          onChangeText={form.setText}
          onSubmitEditing={advance}
          placeholder={t('chat.question.custom')}
          returnKeyType={form.action === 'submit' ? 'done' : 'next'}
          testID="user-question-custom"
          value={form.answer.text}
        />
      </View>
    </BottomSheet>
  );
}
