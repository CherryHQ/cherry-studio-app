import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import { Button, Image, Input, Spinner, TextField } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { useFeedbackCapture } from '@/frontend/appShell/feedback';
import { RouteHeader } from '@/frontend/appShell/header';
import { keyboardBottomOffset } from '@/frontend/utils/constants';
import {
  diagnosticDescriptionByteLength,
  DIAGNOSTIC_DESCRIPTION_MAX_BYTES,
} from '@/shared/contracts/diagnostics';

import { useCopyReportId } from './useCopyReportId';
import { useDiagnosticBundle } from './useDiagnosticBundle';

/** Both manual feedback and shake capture enter this form. */
export function FeedbackScreen() {
  const router = useRouter();
  const { screenshot, captureFailed, clearScreenshot } = useFeedbackCapture();
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [attempted, setAttempted] = useState(false);
  const workflow = useDiagnosticBundle();
  const { state } = workflow;
  const copyReportId = useCopyReportId(state.status === 'uploaded' ? state.reportId : '');
  const normalized = description.trim();
  const bytes = diagnosticDescriptionByteLength(normalized);
  const isTooLong = bytes > DIAGNOSTIC_DESCRIPTION_MAX_BYTES;
  const showError = isTooLong || (attempted && normalized.length === 0);
  const isSubmitting = state.status === 'submitting';
  usePreventRemove(isSubmitting, () => {});
  const title =
    state.status === 'uploaded'
      ? t('settings.about.diagnostics.results.uploaded')
      : state.status === 'submission_unknown'
        ? t('settings.about.diagnostics.results.submission_unknown')
        : state.status === 'failed'
          ? t('settings.about.diagnostics.results.submission_failed')
          : t('settings.about.feedback.title');

  function close() {
    workflow.close(() => {
      Keyboard.dismiss();
      router.back();
    });
  }

  function submit() {
    setAttempted(true);
    if (!normalized || isTooLong) return;
    Keyboard.dismiss();
    void workflow.submit(normalized, screenshot?.id);
  }

  return (
    <>
      <RouteHeader title={title} />
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={keyboardBottomOffset}
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        disableScrollOnKeyboardHide
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        mode="layout"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5 px-4 py-5">
          {state.status === 'editing' ? (
            <>
              <TextField invalid={showError}>
                <Input
                  accessibilityLabel={t('settings.about.diagnostics.description')}
                  className="min-h-36 ios:shadow-field android:shadow-sm"
                  invalid={showError}
                  multiline
                  onChangeText={setDescription}
                  placeholder={t('settings.about.diagnostics.descriptionPlaceholder')}
                  testID="feedback-description"
                  textAlignVertical="top"
                  value={description}
                />
                {showError && (
                  <TextField.Error>
                    {t('settings.about.diagnostics.descriptionError')}
                  </TextField.Error>
                )}
              </TextField>
              {screenshot && (
                <View className="gap-2">
                  <Text className="text-sm font-medium text-foreground">
                    {t('settings.about.feedback.screenshot')}
                  </Text>
                  <Image
                    source={{ uri: screenshot.uri }}
                    contentFit="contain"
                    className="h-56 w-full"
                    accessibilityLabel={t('settings.about.feedback.screenshot')}
                  />
                  <Text className="text-xs leading-5 text-muted-foreground">
                    {t('settings.about.feedback.screenshotConsent')}
                  </Text>
                  <Button
                    variant="ghost"
                    onPress={clearScreenshot}
                    testID="feedback-remove-screenshot"
                  >
                    {t('common.remove')}
                  </Button>
                </View>
              )}
              {captureFailed && (
                <Text className="text-sm text-muted-foreground">
                  {t('settings.about.feedback.screenshotFailed')}
                </Text>
              )}
              <View className="gap-1">
                <Text className="text-sm font-medium text-foreground">
                  {t('settings.about.feedback.attachment')}
                </Text>
                <Text className="text-xs leading-5 text-muted-foreground">
                  {t('settings.about.feedback.consent')}
                </Text>
              </View>
              <View className="gap-2">
                <Button onPress={submit} testID="feedback-submit">
                  {t('settings.about.diagnostics.upload')}
                </Button>
                <Button onPress={close} variant="ghost">
                  {t('common.cancel')}
                </Button>
              </View>
            </>
          ) : isSubmitting ? (
            <View
              accessibilityLiveRegion="polite"
              accessibilityState={{ busy: true }}
              className="min-h-44 items-center justify-center gap-4 py-6"
            >
              <Spinner
                accessibilityLabel={t('settings.about.feedback.submitting')}
                size="default"
              />
              <View className="gap-2">
                <Text className="text-center text-base font-medium text-foreground">
                  {t('settings.about.feedback.submitting')}
                </Text>
                <Text className="text-center text-sm text-muted-foreground">
                  {t('settings.about.feedback.submittingHint')}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View accessibilityLiveRegion="polite" className="items-center gap-4 py-4">
                {state.status === 'uploaded' ? (
                  <CheckIcon className="size-8 text-success" />
                ) : (
                  <CircleAlertIcon className="size-8 text-muted-foreground" />
                )}
                <Text className="text-center text-sm leading-6 text-muted-foreground">
                  {state.status === 'uploaded'
                    ? t('settings.about.feedback.thanks')
                    : state.status === 'submission_unknown'
                      ? t('settings.about.diagnostics.unknownHint')
                      : state.status === 'failed'
                        ? t(state.messageKey)
                        : null}
                </Text>
                {state.status === 'uploaded' && (
                  <View className="w-full gap-1 rounded-lg bg-secondary px-4 py-3">
                    <View className="flex-row items-center justify-between gap-3">
                      <Text className="text-xs text-muted-foreground">
                        {t('settings.about.diagnostics.reportId')}
                      </Text>
                      <Button
                        size="inline"
                        variant="link"
                        accessibilityLabel={t('settings.about.feedback.copyId')}
                        onPress={() => void copyReportId()}
                        testID="feedback-report-copy"
                      >
                        {t('common.copy')}
                      </Button>
                    </View>
                    <Text className="text-sm text-foreground" selectable>
                      {state.reportId}
                    </Text>
                  </View>
                )}
              </View>
              <View className="gap-2">
                {state.status === 'uploaded' ? (
                  <>
                    <Button
                      onPress={() =>
                        router.replace({
                          pathname: '/settings/about/feedback/[reportId]',
                          params: { reportId: state.reportId },
                        })
                      }
                      testID="feedback-view-status"
                    >
                      {t('settings.about.feedback.status.view')}
                    </Button>
                    <Button onPress={close} variant="ghost">
                      {t('common.done')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button onPress={workflow.edit}>
                      {t('settings.about.diagnostics.startAgain')}
                    </Button>
                    <Button onPress={close} variant="ghost">
                      {t('common.close')}
                    </Button>
                  </>
                )}
              </View>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </>
  );
}

const styles = StyleSheet.create({ scroll: { flex: 1 } });
