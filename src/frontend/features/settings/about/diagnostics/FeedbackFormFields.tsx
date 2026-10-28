import BoxesIcon from '@cherrystudio/app-icons/icons/boxes';
import CloudIcon from '@cherrystudio/app-icons/icons/cloud';
import DatabaseIcon from '@cherrystudio/app-icons/icons/database';
import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import MessageCircleIcon from '@cherrystudio/app-icons/icons/message-circle';
import MousePointerClickIcon from '@cherrystudio/app-icons/icons/mouse-pointer-click';
import NetworkIcon from '@cherrystudio/app-icons/icons/network';
import PaletteIcon from '@cherrystudio/app-icons/icons/palette';
import {
  BottomSheet,
  Image,
  OptionPickerBottomSheet,
  Section,
  Switch,
} from '@cherrystudio/ui/components';
import type { TFunction } from 'i18next';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

import { aiFailureReasonTitleKey } from '@/frontend/components/AiFailure';
import { ArtifactImageViewer } from '@/frontend/components/ArtifactPreview';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import {
  DiagnosticFeedbackFeatureSchema,
  DiagnosticFeedbackProblemSchema,
  type DiagnosticFeedbackContext,
  type DiagnosticFeedbackFeature,
  type DiagnosticFeedbackProblem,
} from '@/shared/contracts/diagnostics';
import { resolveAppLanguage } from '@/shared/utils/languages';

/** Icons match the sidebar and settings entries for the same feature. */
const FEATURES = {
  chat: [MessageCircleIcon, 'settings.about.feedback.form.features.chat'],
  agents: [MousePointerClickIcon, 'settings.about.feedback.form.features.agents'],
  providers: [CloudIcon, 'settings.about.feedback.form.features.providers'],
  plugins: [BoxesIcon, 'settings.about.feedback.form.features.plugins'],
  paintings: [PaletteIcon, 'settings.about.feedback.form.features.paintings'],
  files: [FolderIcon, 'settings.about.feedback.form.features.files'],
  desktop: [NetworkIcon, 'settings.about.feedback.form.features.desktop'],
  backup: [DatabaseIcon, 'settings.about.feedback.form.features.backup'],
  other: [EllipsisIcon, 'settings.about.feedback.form.features.other'],
} as const satisfies Record<
  DiagnosticFeedbackFeature,
  readonly [ComponentType<{ className?: string }>, string]
>;
const PROBLEMS = {
  error: [
    'settings.about.feedback.form.problems.error',
    'settings.about.feedback.form.hints.error',
  ],
  performance: [
    'settings.about.feedback.form.problems.performance',
    'settings.about.feedback.form.hints.performance',
  ],
  interface: [
    'settings.about.feedback.form.problems.interface',
    'settings.about.feedback.form.hints.interface',
  ],
  unexpected_result: [
    'settings.about.feedback.form.problems.unexpectedResult',
    'settings.about.feedback.form.hints.unexpectedResult',
  ],
  suggestion: [
    'settings.about.feedback.form.problems.suggestion',
    'settings.about.feedback.form.hints.suggestion',
  ],
  other: ['settings.about.feedback.form.problems.other', undefined],
} as const satisfies Record<DiagnosticFeedbackProblem, readonly [string, string | undefined]>;

export type FeedbackFormValue = {
  feature?: DiagnosticFeedbackFeature;
  problem?: DiagnosticFeedbackProblem;
  description: string;
  includeContext: boolean;
};

export function FeedbackFormFields({
  attempted,
  captureFailed,
  context,
  isDescriptionTooLong,
  isScreenshotIncluded,
  onChange,
  onScreenshotIncludedChange,
  screenshot,
  value,
}: {
  attempted: boolean;
  captureFailed: boolean;
  context?: DiagnosticFeedbackContext;
  isDescriptionTooLong: boolean;
  isScreenshotIncluded: boolean;
  onChange: (value: FeedbackFormValue) => void;
  onScreenshotIncludedChange: (included: boolean) => void;
  screenshot?: { uri: string };
  value: FeedbackFormValue;
}) {
  const { i18n, t } = useTranslation();
  const mutedForegroundColor = useThemeColor('muted-foreground');
  const [picker, setPicker] = useState<'feature' | 'problem' | 'screenshot'>();
  const isDescriptionInvalid = isDescriptionTooLong || (attempted && !value.description.trim());
  const placeholder = (
    <Text className="text-base text-muted-foreground">{t('settings.select.placeholder')}</Text>
  );
  return (
    <>
      <View className="gap-2">
        <Section>
          <Section.SelectItem
            label={t('settings.about.feedback.form.feature')}
            onPress={() => setPicker('feature')}
            testID="feedback-feature"
            value={value.feature ? t(FEATURES[value.feature][1]) : placeholder}
          />
          <Section.SelectItem
            label={t('settings.about.feedback.form.problem')}
            onPress={() => setPicker('problem')}
            testID="feedback-problem"
            value={value.problem ? t(PROBLEMS[value.problem][0]) : placeholder}
          />
        </Section>
        {attempted && (!value.feature || !value.problem) ? (
          <Text accessibilityLiveRegion="polite" className="px-3 text-sm text-error">
            {t(
              value.feature
                ? 'settings.about.feedback.form.problemRequired'
                : value.problem
                  ? 'settings.about.feedback.form.featureRequired'
                  : 'settings.about.feedback.form.selectRequired',
            )}
          </Text>
        ) : null}
      </View>
      <View className="gap-2">
        <Section title={t('settings.about.feedback.form.description')}>
          <TextInput
            accessibilityLabel={t('settings.about.feedback.form.description')}
            className="min-h-36 px-4 py-3 text-base text-foreground"
            cursorColor={mutedForegroundColor}
            multiline
            onChangeText={(description) => onChange({ ...value, description })}
            placeholder={t('settings.about.diagnostics.descriptionPlaceholder')}
            placeholderTextColor={mutedForegroundColor}
            scrollEnabled={false}
            selectionColor={mutedForegroundColor}
            testID="feedback-description"
            textAlignVertical="top"
            value={value.description}
          />
        </Section>
        {isDescriptionInvalid ? (
          <Text accessibilityLiveRegion="polite" className="px-3 text-sm text-error">
            {t(
              isDescriptionTooLong
                ? 'settings.about.feedback.form.descriptionTooLong'
                : 'settings.about.feedback.form.descriptionRequired',
            )}
          </Text>
        ) : null}
      </View>
      {context || screenshot || captureFailed ? (
        <Section title={t('settings.about.feedback.attachments')}>
          {context ? (
            <Section.SwitchItem
              description={feedbackContextSummary(
                context,
                t,
                i18n.resolvedLanguage ?? i18n.language,
              )}
              label={t('settings.about.feedback.context.title')}
              onValueChange={(includeContext) => onChange({ ...value, includeContext })}
              testID="feedback-include-context"
              value={value.includeContext}
            />
          ) : null}
          {screenshot ? (
            <Section.Item
              description={t('settings.about.feedback.screenshotConsent')}
              label={t('settings.about.feedback.screenshot')}
              trailing={
                <View className="flex-row items-center gap-3">
                  <Pressable
                    accessibilityLabel={t('settings.about.feedback.previewScreenshot')}
                    accessibilityRole="imagebutton"
                    className="active:opacity-80"
                    hitSlop={6}
                    onPress={() => setPicker('screenshot')}
                    testID="feedback-preview-screenshot"
                  >
                    <Image
                      className="h-13 w-9 rounded-md border border-border bg-background"
                      contentFit="cover"
                      source={{ uri: screenshot.uri }}
                    />
                  </Pressable>
                  <Switch
                    accessibilityLabel={t('settings.about.feedback.includeScreenshot')}
                    onValueChange={onScreenshotIncludedChange}
                    testID="feedback-include-screenshot"
                    value={isScreenshotIncluded}
                  />
                </View>
              }
            />
          ) : captureFailed ? (
            <Section.Item
              description={t('settings.about.feedback.screenshotFailed')}
              label={t('settings.about.feedback.screenshot')}
            />
          ) : null}
        </Section>
      ) : null}
      <OptionPickerBottomSheet<DiagnosticFeedbackFeature | ''>
        onClose={() => setPicker(undefined)}
        onValueChange={(feature) => {
          if (feature) onChange({ ...value, feature });
        }}
        open={picker === 'feature'}
        options={DiagnosticFeedbackFeatureSchema.options.map((feature) => {
          const [Icon, labelKey] = FEATURES[feature];
          return {
            value: feature,
            label: t(labelKey),
            leading: <Icon className="size-4 text-foreground" />,
          };
        })}
        selectedValue={value.feature ?? ''}
        size="large"
        testID="feedback-feature-options"
        title={t('settings.about.feedback.form.feature')}
      />
      <OptionPickerBottomSheet<DiagnosticFeedbackProblem | ''>
        onClose={() => setPicker(undefined)}
        onValueChange={(problem) => {
          if (problem) onChange({ ...value, problem });
        }}
        open={picker === 'problem'}
        options={DiagnosticFeedbackProblemSchema.options.map((problem) => {
          const [labelKey, hintKey] = PROBLEMS[problem];
          return {
            value: problem,
            label: t(labelKey),
            description: hintKey ? t(hintKey) : undefined,
          };
        })}
        selectedValue={value.problem ?? ''}
        size="large"
        testID="feedback-problem-options"
        title={t('settings.about.feedback.form.problem')}
      />
      {screenshot && picker === 'screenshot' ? (
        <BottomSheet
          onClose={() => setPicker(undefined)}
          open
          size="large"
          testID="feedback-screenshot-preview"
          title={t('settings.about.feedback.screenshot')}
        >
          <View className="flex-1">
            <ArtifactImageViewer
              accessibilityLabel={t('settings.about.feedback.screenshot')}
              uri={screenshot.uri}
            />
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}

/** One line of app-owned facts; the user can turn the whole association off. */
function feedbackContextSummary(
  context: DiagnosticFeedbackContext,
  t: TFunction,
  language: string,
): string {
  const reasonKey = aiFailureReasonTitleKey(context.error?.reason);
  const time = new Intl.DateTimeFormat(resolveAppLanguage(language), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(context.occurredAt ?? context.messageCreatedAt ?? context.capturedAt));
  return [
    reasonKey ? t(reasonKey) : undefined,
    context.executionSource
      ? t(
          context.executionSource === 'desktop'
            ? 'settings.about.feedback.context.desktop'
            : 'settings.about.feedback.context.local',
        )
      : undefined,
    context.modelId,
    t(
      context.occurredAt
        ? 'settings.about.feedback.context.occurredAt'
        : context.messageCreatedAt
          ? 'settings.about.feedback.context.messageCreatedAt'
          : 'settings.about.feedback.context.capturedAt',
      { time },
    ),
  ]
    .filter(Boolean)
    .join(' · ');
}
