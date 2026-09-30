import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { BottomSheet, Button, Input, SelectionIndicator } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { useResolveClassNames } from 'uniwind';

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
  // Skipping is the quiet way out; an answer turns the action into the filled next step.
  const actionVariant = form.action === 'skip' ? 'ghost' : 'default';
  // The free-text field matches the option cards it continues.
  const fieldStyle = useResolveClassNames('min-h-13 rounded-xl px-4');
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
        <View className="flex-row items-center gap-3">
          {total > 1 ? (
            // Browsing moves between questions without skipping; the action answers.
            <View className="-ml-1.5 flex-row items-center">
              <Button
                accessibilityLabel={t('chat.question.previous')}
                disabled={form.locked || form.index === 0}
                icon={<ChevronLeftIcon />}
                onPress={() => form.navigate(form.index - 1)}
                size="sm"
                testID="user-question-previous"
                variant="ghost"
              />
              <Text
                accessibilityLabel={t('chat.question.progressLabel', {
                  current: form.index + 1,
                  total,
                })}
                accessibilityLiveRegion="polite"
                className="text-foreground-tertiary text-sm tabular-nums"
              >
                {t('chat.question.progress', { current: form.index + 1, total })}
              </Text>
              <Button
                accessibilityLabel={t('chat.question.next')}
                disabled={form.locked || form.index === total - 1}
                icon={<ChevronRightIcon />}
                onPress={() => form.navigate(form.index + 1)}
                size="sm"
                testID="user-question-next"
                variant="ghost"
              />
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
      onClose={ignoreClose}
      open={open}
      size="medium"
      testID="user-question-sheet"
      // The question is the sheet's subject, so it titles the sheet and is never truncated.
      title={form.question.question}
      titleVariant="prompt"
    >
      <ScrollView
        key={form.question.id}
        className="min-h-0 flex-1"
        contentContainerClassName="gap-4 px-5 pb-4"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {form.question.options.length ? (
          <View className="gap-2">
            {form.question.options.map((option) => {
              const selected = form.answer.selectedOptionIds.includes(option.id);
              return (
                <Pressable
                  key={option.id}
                  accessibilityLabel={option.label}
                  accessibilityHint={option.description}
                  accessibilityRole={form.question.selection === 'multiple' ? 'checkbox' : 'radio'}
                  accessibilityState={{ checked: selected, disabled: form.locked }}
                  className={`min-h-13 flex-row items-center gap-3 rounded-xl border bg-field px-4 py-3 active:opacity-70 ${selected ? 'border-foreground' : 'border-border'}`}
                  disabled={form.locked}
                  onPress={() => form.select(option.id)}
                >
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="font-medium text-base text-foreground">{option.label}</Text>
                    {option.description ? (
                      <Text className="text-foreground-tertiary text-sm">{option.description}</Text>
                    ) : null}
                  </View>
                  <SelectionIndicator
                    control={form.question.selection === 'multiple' ? 'checkbox' : 'radio'}
                    selected={selected}
                  />
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
          style={fieldStyle}
          testID="user-question-custom"
          value={form.answer.text}
        />
      </View>
    </BottomSheet>
  );
}
