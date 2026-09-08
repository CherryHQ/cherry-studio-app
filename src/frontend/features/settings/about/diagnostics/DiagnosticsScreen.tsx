import {
  Button,
  ContentState,
  OptionPickerBottomSheet,
  Section,
  useToast,
} from '@cherrystudio/ui/components';
import { setStringAsync } from 'expo-clipboard';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { usePreference } from '@/frontend/data/hooks';
import type { DiagnosticBundleInput, DiagnosticRange } from '@/shared/contracts/diagnostics';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';
import { DiagnosticSubmissionActions } from './DiagnosticSubmissionActions';
import { useDiagnosticBundle } from './useDiagnosticBundle';

const RANGES: DiagnosticRange[] = ['24h', '3d', '7d'];
const SOURCES = ['logs', 'traces', 'chatRecords'] as const;
const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.ceil(bytes / 1024)} KiB`;

export default function DiagnosticsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [range, setRange] = useState<DiagnosticRange>('24h');
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState({ logs: true, traces: true, chatRecords: false });
  const [acknowledged, setAcknowledged] = useState(false);
  const workflow = useDiagnosticBundle(range);
  usePreventRemove(workflow.isBusy, () => workflow.showBusy());
  const { inspection, outcome } = workflow;
  const input: DiagnosticBundleInput = {
    range,
    includeLogs: selected.logs && !!inspection?.sources.logs.available,
    includeTraces: selected.traces && !!inspection?.sources.traces.available,
    includeChatRecords: selected.chatRecords && !!inspection?.sources.chatRecords.available,
  };
  const canSubmit = !!inspection && acknowledged;
  const estimatedBytes = SOURCES.reduce(
    (total, source) =>
      total + (selected[source] ? (inspection?.sources[source].estimatedBytes ?? 0) : 0),
    0,
  );
  const failedUpload =
    outcome?.status === 'submission_failed' || outcome?.status === 'submission_unknown';

  return (
    <>
      <SettingsScrollPage
        contentClassName="gap-6"
        headerProps={{ title: t('settings.about.diagnostics.title') }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="text-base text-foreground">{t('settings.about.diagnostics.intro')}</Text>
        {!outcome ? (
          <>
            <Section>
              <Section.SelectItem
                disabled={workflow.isBusy}
                label={t('settings.about.diagnostics.range')}
                onPress={() => setPickerOpen(true)}
                value={t(`settings.about.diagnostics.ranges.${range}`)}
              />
            </Section>
            {workflow.inspectionFailed ? (
              <ContentState.Error
                title={t('settings.about.diagnostics.errors.INSPECT_FAILED')}
                primaryAction={{ children: t('common.retry'), onPress: workflow.refresh }}
              />
            ) : !inspection ? (
              <ContentState.Loading
                layout="row"
                title={t('settings.about.diagnostics.inspecting')}
              />
            ) : (
              <Section
                title={t('settings.about.diagnostics.sources')}
                footer={t('settings.about.diagnostics.sizeHint', {
                  size: formatBytes(estimatedBytes),
                  limit: formatBytes(inspection.sourceLimitBytes),
                })}
              >
                {SOURCES.map((source) => {
                  const info = inspection.sources[source];
                  const count = 'messageCount' in info ? info.messageCount : info.fileCount;
                  return (
                    <Section.SwitchItem
                      key={source}
                      disabled={workflow.isBusy || !info.available}
                      label={t(`settings.about.diagnostics.sourceLabels.${source}`)}
                      description={
                        info.available
                          ? t('settings.about.diagnostics.sourceAvailable', {
                              count,
                              size: formatBytes(info.estimatedBytes),
                            })
                          : t('settings.about.diagnostics.sourceUnavailable')
                      }
                      value={selected[source] && info.available}
                      onValueChange={(value) =>
                        setSelected((current) => ({ ...current, [source]: value }))
                      }
                    />
                  );
                })}
                <Section.Item
                  label={t('settings.about.diagnostics.system')}
                  description={t('settings.about.diagnostics.systemHint', {
                    count: inspection.sources.crashDumps.fileCount,
                  })}
                  showChevron={false}
                />
              </Section>
            )}
            {inspection?.hasWarnings && (
              <Text className="text-sm text-warning">
                {t('settings.about.diagnostics.inspectionWarning')}
              </Text>
            )}
            <TraceRecordingPreference disabled={workflow.isBusy} />
            <Section footer={t('settings.about.diagnostics.privacy')}>
              <Section.SwitchItem
                disabled={workflow.isBusy}
                label={t('settings.about.diagnostics.acknowledge')}
                value={acknowledged}
                onValueChange={setAcknowledged}
              />
            </Section>
            <DiagnosticSubmissionActions
              canSubmit={canSubmit}
              isBusy={workflow.isBusy}
              onExport={() => {
                void workflow.exportBundle(input);
              }}
              onUpload={(description) => {
                void workflow.uploadBundle(input, description);
              }}
            />
          </>
        ) : (
          <View className="gap-4">
            <Text accessibilityRole="header" className="font-semibold text-lg text-foreground">
              {t(`settings.about.diagnostics.results.${outcome.status}`)}
            </Text>
            {outcome.status === 'uploaded' ? (
              <>
                <Text className="text-sm text-muted-foreground">
                  {t('settings.about.diagnostics.reportId')}
                </Text>
                <Text className="font-mono text-base text-foreground" selectable>
                  {outcome.reportId}
                </Text>
                <Button
                  variant="secondary"
                  onPress={() => {
                    void setStringAsync(outcome.reportId).then(
                      () =>
                        toast.show({
                          label: t('settings.about.diagnostics.copied'),
                          variant: 'success',
                        }),
                      () =>
                        toast.show({
                          label: t('settings.about.diagnostics.errors.operationFailed'),
                          variant: 'danger',
                        }),
                    );
                  }}
                >
                  {t('settings.about.diagnostics.copyReportId')}
                </Button>
              </>
            ) : outcome.status === 'saved' ? (
              <>
                <Text className="text-base text-foreground" selectable>
                  {outcome.fileName}
                </Text>
                <Text className="text-sm text-muted-foreground" selectable>
                  {outcome.filePath}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {t('settings.about.diagnostics.exportSummary', {
                    size: formatBytes(outcome.archiveBytes),
                    included: outcome.includedFileCount,
                    omitted: outcome.omittedFileCount,
                  })}
                </Text>
                {outcome.hasWarnings && (
                  <Text className="text-sm text-warning">
                    {t('settings.about.diagnostics.exportWarning')}
                  </Text>
                )}
              </>
            ) : (
              <>
                <Text className="text-base text-foreground">
                  {outcome.status === 'submission_unknown'
                    ? t('settings.about.diagnostics.unknownHint')
                    : t(`settings.about.diagnostics.failures.${outcome.reason}`)}
                </Text>
                <Text className="text-sm text-muted-foreground" selectable>
                  {outcome.fileName}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {t('settings.about.diagnostics.retainedHint')}
                </Text>
                <Button
                  disabled={workflow.isBusy}
                  onPress={() => {
                    void workflow.retry();
                  }}
                >
                  {t('settings.about.diagnostics.retryUpload')}
                </Button>
                <Button
                  disabled={workflow.isBusy || !!workflow.savedUri}
                  onPress={() => {
                    void workflow.save();
                  }}
                  variant="secondary"
                >
                  {t(
                    workflow.savedUri
                      ? 'settings.about.diagnostics.saved'
                      : 'settings.about.diagnostics.saveUpload',
                  )}
                </Button>
                {workflow.savedUri && (
                  <Text className="text-sm text-muted-foreground" selectable>
                    {workflow.savedUri}
                  </Text>
                )}
              </>
            )}
            <Button
              disabled={workflow.isBusy}
              onPress={() => {
                void workflow.reset();
              }}
              variant="ghost"
            >
              {t(
                failedUpload
                  ? 'settings.about.diagnostics.discard'
                  : 'settings.about.diagnostics.startAgain',
              )}
            </Button>
          </View>
        )}
        {workflow.isBusy && (
          <ContentState.Loading
            layout="row"
            title={t(`settings.about.diagnostics.operations.${workflow.operation!}`)}
          />
        )}
      </SettingsScrollPage>
      <OptionPickerBottomSheet
        title={t('settings.about.diagnostics.range')}
        open={isPickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedValue={range}
        options={RANGES.map((value) => ({
          label: t(`settings.about.diagnostics.ranges.${value}`),
          value,
        }))}
        onValueChange={setRange}
        size="compact"
      />
    </>
  );
}

function TraceRecordingPreference({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [enabled, setEnabled] = usePreference('app.developer_mode.enabled');
  return (
    <Section footer={t('settings.about.diagnostics.traceRecordingHint')}>
      <Section.SwitchItem
        disabled={disabled}
        label={t('settings.about.diagnostics.traceRecording')}
        value={enabled}
        onValueChange={(value) => {
          void setEnabled(value).then(
            () =>
              toast.show({
                label: t('settings.about.diagnostics.restartRequired'),
                variant: 'success',
              }),
            () =>
              toast.show({
                label: t('settings.about.diagnostics.errors.operationFailed'),
                variant: 'danger',
              }),
          );
        }}
      />
    </Section>
  );
}
