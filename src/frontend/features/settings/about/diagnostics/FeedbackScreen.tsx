import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import { Button, Spinner } from '@cherrystudio/ui/components';
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
  diagnosticReportDescription,
  DIAGNOSTIC_DESCRIPTION_MAX_BYTES,
} from '@/shared/contracts/diagnostics';

import { FeedbackFormFields, type FeedbackFormValue } from './FeedbackFormFields';
import { useCopyReportId } from './useCopyReportId';
import { useDiagnosticBundle } from './useDiagnosticBundle';

/** Both manual feedback and shake capture enter this form. */
export function FeedbackScreen() {
  const router = useRouter();
  const { screenshot, captureFailed, context } = useFeedbackCapture();
  const { t } = useTranslation();
  const [form, setForm] = useState<FeedbackFormValue>(() => ({
    description: '',
    feature: context?.feature,
    problem: context?.entry === 'error' || context?.error ? 'error' : undefined,
    includeContext: true,
  }));
  const [attempted, setAttempted] = useState(false);
  const workflow = useDiagnosticBundle(screenshot?.id);
  const { state } = workflow;
  const copyReportId = useCopyReportId(state.status === 'uploaded' ? state.reportId : '');
  const normalized = form.description.trim();
  const feedback =
    form.feature && form.problem ? { feature: form.feature, problem: form.problem } : undefined;
  const bytes = diagnosticDescriptionByteLength(
    diagnosticReportDescription({ description: normalized, feedback }),
  );
  const isTooLong = bytes > DIAGNOSTIC_DESCRIPTION_MAX_BYTES;
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
    if (!normalized || isTooLong || !feedback) return;
    Keyboard.dismiss();
    void workflow.submit(normalized, {
      feedback,
      context: form.includeContext ? context : undefined,
    });
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
        <View className="gap-6 px-4 py-5">
          {state.status === 'editing' ? (
            <>
              <FeedbackFormFields
                attempted={attempted}
                captureFailed={captureFailed}
                context={context}
                isDescriptionTooLong={isTooLong}
                isScreenshotIncluded={workflow.isScreenshotIncluded}
                onChange={setForm}
                onScreenshotIncludedChange={workflow.setScreenshotIncluded}
                screenshot={screenshot}
                value={form}
              />
              <View className="gap-3">
                <Button onPress={submit} testID="feedback-submit">
                  {t('settings.about.diagnostics.upload')}
                </Button>
                <Text className="px-2 text-center text-xs text-muted-foreground">
                  {t('settings.about.feedback.consent')}
                </Text>
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
