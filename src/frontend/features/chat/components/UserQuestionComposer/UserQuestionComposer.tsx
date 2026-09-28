import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, Input } from '@cherrystudio/ui/components';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  Text,
  type TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';
import { useResolveClassNames } from 'uniwind';

import { useComposerPresentationActions } from '@/frontend/components/Composer';

import { type UserQuestionComposerProps, useUserQuestionForm } from './useUserQuestionForm';

export function UserQuestionComposer(props: UserQuestionComposerProps) {
  const { t } = useTranslation();
  const form = useUserQuestionForm(props);
  const { activateInput, dismissInput } = useComposerPresentationActions();
  const inputRef = useRef<TextInput>(null);
  const { height } = useWindowDimensions();
  const inputStyle = useResolveClassNames(
    'min-h-10 rounded-lg border-0 bg-secondary px-3 py-0 text-sm',
  );
  useEffect(() => {
    dismissInput();
    // The ordinary composer unmounts before this form, so its blur can no longer hide the Android IME.
    void KeyboardController.dismiss();
    return dismissInput;
  }, [dismissInput]);
  const isLast = form.index === form.questions.length - 1;
  const progress = t('chat.question.progress', {
    current: form.index + 1,
    total: form.questions.length,
  });

  return (
    <View
      className="gap-1 rounded-2xl border border-border bg-card p-2"
      testID="user-question-composer"
    >
      <View className="flex-row items-start gap-1">
        <ScrollView
          className="min-w-0 flex-1"
          style={{ maxHeight: Math.min(96, height * 0.15) }}
          keyboardShouldPersistTaps="always"
        >
          <View className="min-h-11 justify-center gap-0.5 px-2 py-2">
            {form.question.header ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {form.question.header}
              </Text>
            ) : null}
            <View className="flex-row flex-wrap items-center gap-x-2">
              <Text
                accessibilityRole="header"
                className="shrink font-medium text-sm text-foreground"
              >
                {form.question.question}
              </Text>
              {form.question.selection === 'multiple' && form.question.options.length > 0 ? (
                <Text className="text-xs text-muted-foreground">{t('chat.question.multiple')}</Text>
              ) : null}
            </View>
          </View>
        </ScrollView>
        <View className="flex-row items-center">
          <Button
            accessibilityLabel={t('chat.question.previous')}
            disabled={form.locked || form.index === 0}
            icon={<ChevronLeftIcon />}
            onPress={() => form.navigate(form.index - 1)}
            size="xs"
            testID="user-question-previous"
            variant="ghost"
          />
          <Text
            accessibilityLabel={t('chat.question.progressLabel', {
              current: form.index + 1,
              total: form.questions.length,
            })}
            accessibilityLiveRegion="polite"
            className="text-xs text-muted-foreground"
          >
            {progress}
          </Text>
          {isLast ? (
            <Button
              disabled={form.locked || !form.isComplete}
              loading={form.busy}
              onPress={() => {
                dismissInput();
                void form.submit();
              }}
              size="xs"
              testID="user-question-submit"
              variant="ghost"
            >
              {t('chat.question.submit')}
            </Button>
          ) : (
            <Button
              accessibilityLabel={t('chat.question.next')}
              disabled={form.locked}
              icon={<ChevronRightIcon />}
              onPress={() => form.navigate(form.index + 1)}
              size="xs"
              testID="user-question-next"
              variant="ghost"
            />
          )}
        </View>
      </View>
      {form.question.options.length ? (
        <ScrollView
          key={form.question.id}
          contentContainerClassName="gap-1"
          style={{ maxHeight: Math.min(176, height * 0.26) }}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator
        >
          {form.question.options.map((option) => {
            const selected = form.answer.selectedOptionIds.includes(option.id);
            return (
              <Pressable
                key={option.id}
                accessibilityLabel={option.label}
                accessibilityHint={option.description}
                accessibilityRole={form.question.selection === 'multiple' ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: selected, disabled: form.locked }}
                className={`min-h-11 flex-row items-center gap-2 rounded-lg px-3 py-2 active:opacity-70 ${selected ? 'bg-secondary' : ''}`}
                disabled={form.locked}
                onPress={() => form.select(option.id)}
              >
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-sm text-foreground">{option.label}</Text>
                  {option.description ? (
                    <Text className="text-xs text-muted-foreground">{option.description}</Text>
                  ) : null}
                </View>
                {selected ? (
                  <CheckIcon className="size-4 text-foreground" />
                ) : (
                  <View className="size-4" />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View className="flex-row items-center gap-1 pt-1">
        <View className="min-w-0 flex-1">
          <Input
            accessibilityLabel={t('chat.question.custom')}
            disabled={form.locked}
            maxLength={4000}
            onChangeText={form.setText}
            onFocus={() => activateInput(inputRef.current)}
            placeholder={t('chat.question.custom')}
            ref={inputRef}
            style={inputStyle}
            testID="user-question-custom"
            value={form.answer.text}
          />
        </View>
        {form.allowSkip ? (
          <Button
            disabled={form.locked}
            onPress={form.skip}
            size="xs"
            testID="user-question-skip"
            variant="ghost"
          >
            {t('chat.question.skip')}
          </Button>
        ) : null}
      </View>
      {form.answer.skipped ? (
        <Text className="px-2 text-xs text-muted-foreground">{t('chat.question.skipped')}</Text>
      ) : null}
      {form.failed ? (
        <Text accessibilityRole="alert" className="px-2 text-sm text-error">
          {t('chat.question.failed')}
        </Text>
      ) : null}
    </View>
  );
}
