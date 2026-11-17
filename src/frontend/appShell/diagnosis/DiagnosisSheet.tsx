import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import RotateCwIcon from '@cherrystudio/app-icons/icons/rotate-cw';
import {
  BottomSheet,
  Button,
  MessagePart,
  Section,
  Spinner,
  useOverlayNavigation,
} from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import type { ModelPickerModelItem } from '@/frontend/components/ModelPicker';
import type { DiagnosticFeedbackContext } from '@/shared/contracts/diagnostics';
import type {
  DiagnosticCheck,
  DiagnosticFeedbackSummary,
} from '@/shared/contracts/diagnosticSession';

import { DiagnosticAiResult } from './DiagnosticAiResult';
import { DiagnosticEvidenceDetail } from './DiagnosticEvidenceDetail';
import {
  checkKeys,
  configurationIssueKeys,
  factKeys,
  issueKeys,
  statusKeys,
} from './diagnosticLabels';
import { DiagnosticModelPicker } from './DiagnosticModelPicker';
import { useDiagnosticSession } from './useDiagnosticSession';

type PanelView =
  | { kind: 'checks' }
  | { kind: 'models' }
  | { kind: 'analysis' }
  | { kind: 'detail'; entry: DiagnosticCheck };

const coreChecks = ['data', 'runtime', 'model', 'endpoint'] as const;
const needsAttention = (check: DiagnosticCheck) => ['fail', 'warn', 'error'].includes(check.status);

export function DiagnosisSheet({
  context,
  onClose,
  onFeedback,
}: {
  context: DiagnosticFeedbackContext;
  onClose: () => void;
  onFeedback: (summary?: DiagnosticFeedbackSummary) => void;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const overlays = useOverlayNavigation();
  const workflow = useDiagnosticSession(context);
  const [view, setView] = useState<PanelView>({ kind: 'checks' });
  const [model, setModel] = useState<ModelPickerModelItem>();
  const busy = workflow.busy !== undefined;
  const checks: DiagnosticCheck[] = coreChecks.map(
    (id) => workflow.checks.find((check) => check.id === id) ?? { id, status: 'pending' },
  );
  const finding =
    checks.find(needsAttention) ??
    checks.find((check) => check.id === 'model' && check.issue === 'missing_model');
  const target = workflow.report?.target;
  const configurationIssue = target?.configurationIssue;
  const findingLabel =
    finding?.status === 'error'
      ? t('diagnosis.partialChecks')
      : finding?.id === 'model' && configurationIssue
        ? t(configurationIssueKeys[configurationIssue])
        : finding?.issue
          ? t(issueKeys[finding.issue])
          : t('diagnosis.needsAttention');
  const summary =
    workflow.busy === 'check'
      ? t('diagnosis.running')
      : !workflow.report && workflow.error
        ? t(`diagnosis.error.${workflow.error}`)
        : finding
          ? findingLabel
          : t('diagnosis.localPassed');
  const numbers = new Intl.NumberFormat(i18n.resolvedLanguage);
  const completed = checks.filter((check) => check.status !== 'pending').length;
  const settingsLabel =
    finding?.id === 'runtime'
      ? t('diagnosis.feedback')
      : target && (!finding || finding.id === 'model' || finding.id === 'endpoint')
        ? t('diagnosis.providerSettings', { provider: target.providerName })
        : t('diagnosis.openSettings');

  function feedback() {
    onFeedback(
      workflow.report
        ? {
            checkedAt: workflow.report.checkedAt,
            checks: workflow.report.checks,
            aiCompleted: Boolean(workflow.ai),
          }
        : undefined,
    );
  }

  async function settings(check = finding) {
    const controller = new AbortController();
    const destination = check?.id === 'data' ? '/settings/data' : undefined;
    if (check?.id === 'runtime') {
      feedback();
      return;
    }
    if (!(await overlays.prepareForNavigation(controller.signal))) return;
    if (destination) router.push(destination);
    else if (target?.providerId)
      router.push({
        pathname: '/settings/provider/[providerId]',
        params: { providerId: target.providerId },
      });
    else router.push('/settings/provider');
  }

  async function addProvider() {
    if (await overlays.prepareForNavigation(new AbortController().signal))
      router.push('/settings/provider');
  }

  function back() {
    if (workflow.busy === 'ai') workflow.cancel();
    setView({ kind: 'checks' });
  }

  function recheck() {
    setView({ kind: 'checks' });
    setModel(undefined);
    void workflow.check();
  }

  function showDetail(entry: DiagnosticCheck) {
    setView({ kind: 'detail', entry });
  }

  const rows = (
    <Section variant="plain">
      {checks.map((check) => (
        <Section.Item
          key={check.id}
          accessibilityLabel={t(checkKeys[check.id])}
          inset="none"
          label={<Text className="text-sm text-foreground">{t(checkKeys[check.id])}</Text>}
          onPress={check.status === 'pending' ? undefined : () => showDetail(check)}
          trailing={<DiagnosticCheckStatus check={check} />}
        />
      ))}
    </Section>
  );

  let footer: ReactNode;
  if (view.kind === 'checks')
    footer = (
      <View className="gap-2">
        <Button
          disabled={busy}
          onPress={workflow.report ? () => setView({ kind: 'models' }) : recheck}
        >
          {t(busy || workflow.report ? 'diagnosis.startAi' : 'diagnosis.recheck')}
        </Button>
        <Text className="text-center text-xs text-muted-foreground">
          {t('diagnosis.localOnly')}
        </Text>
      </View>
    );
  else if (view.kind === 'models')
    footer = (
      <View className="gap-2">
        <MessagePart.ToolGroup
          state="complete"
          statusText={t('diagnosis.aiCost')}
          title={t('diagnosis.sendSummary')}
        >
          <Text className="text-sm text-muted-foreground">{t('diagnosis.sendSummaryNote')}</Text>
        </MessagePart.ToolGroup>
        <Button
          disabled={busy || !model || !workflow.report}
          onPress={() => {
            if (model) {
              setView({ kind: 'analysis' });
              void workflow.diagnose(model.modelId);
            }
          }}
        >
          {t('diagnosis.startAnalysis')}
        </Button>
      </View>
    );
  else if (view.kind === 'analysis')
    footer =
      workflow.busy === 'ai' ? (
        <Button variant="secondary" onPress={workflow.cancel}>
          {t('common.cancel')}
        </Button>
      ) : workflow.ai ? (
        <Button onPress={() => void settings()}>{settingsLabel}</Button>
      ) : (
        <Button
          disabled={busy}
          onPress={workflow.error === 'stale' ? recheck : () => setView({ kind: 'models' })}
        >
          {t(workflow.error === 'stale' ? 'diagnosis.recheck' : 'diagnosis.changeModel')}
        </Button>
      );

  const title =
    view.kind === 'checks'
      ? t('diagnosis.title')
      : view.kind === 'models'
        ? t('diagnosis.chooseModel')
        : view.kind === 'analysis'
          ? t(workflow.ai ? 'diagnosis.aiResult' : 'diagnosis.aiTitle')
          : t(checkKeys[view.entry.id]);

  return (
    <BottomSheet
      backAction={
        view.kind === 'checks' ? undefined : { accessibilityLabel: t('common.back'), onPress: back }
      }
      closeAction={{ accessibilityLabel: t('common.close') }}
      footer={footer}
      headerAction={
        view.kind === 'checks' ? (
          <Button
            accessibilityLabel={t('diagnosis.recheck')}
            disabled={busy}
            hitSlop={2}
            icon={<RotateCwIcon />}
            variant="ghost"
            onPress={recheck}
          />
        ) : view.kind === 'analysis' && !(workflow.ai && finding?.id === 'runtime') ? (
          <Button disabled={busy} hitSlop={4} size="sm" variant="ghost" onPress={feedback}>
            {t('diagnosis.feedback')}
          </Button>
        ) : undefined
      }
      onClose={onClose}
      open
      size="full"
      title={title}
      titleAlign="center"
      avoidKeyboard={view.kind === 'models'}
      testID="diagnosis-sheet"
    >
      {view.kind === 'models' ? (
        <DiagnosticModelPicker
          onAddProvider={() => void addProvider()}
          onSelect={setModel}
          selectedModelId={model?.modelId ?? null}
          unavailableModelId={
            configurationIssue === 'invalid-endpoint' ? target?.uniqueModelId : undefined
          }
          unavailableProviderId={
            configurationIssue && configurationIssue !== 'invalid-endpoint'
              ? target?.providerId
              : undefined
          }
        />
      ) : (
        <ScrollView
          key={view.kind}
          contentContainerClassName={
            view.kind === 'analysis' ? 'px-5 pb-6 pt-3' : 'gap-6 px-4 pb-6 pt-4'
          }
          keyboardShouldPersistTaps="handled"
        >
          {view.kind === 'checks' ? (
            <>
              <View className="gap-2">
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityRole="header"
                  className="text-lg font-medium text-foreground"
                >
                  {summary}
                </Text>
                {target ? (
                  <Text className="text-xs text-muted-foreground">
                    {target.providerName} · {target.modelName}
                  </Text>
                ) : null}
                {context.executionSource === 'desktop' ? (
                  <Text className="text-sm text-muted-foreground">
                    {t('diagnosis.issue.remote')}
                  </Text>
                ) : null}
                {finding && ['model', 'data', 'runtime'].includes(finding.id) ? (
                  <View className="items-start">
                    <Button size="inline" variant="text" onPress={() => void settings()}>
                      {t(
                        finding.id === 'runtime' ? 'diagnosis.feedback' : 'diagnosis.openSettings',
                      )}
                    </Button>
                  </View>
                ) : null}
              </View>
              <View className="gap-2">
                <View className="flex-row justify-between gap-3">
                  <Text className="text-sm font-medium text-foreground">
                    {t('diagnosis.applicationChecks')}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {numbers.format(completed)} / {numbers.format(checks.length)}
                  </Text>
                </View>
                {rows}
              </View>
              <MessagePart.ToolGroup state="complete" title={t('diagnosis.incidentDetails')}>
                <DiagnosticIncident context={context} />
              </MessagePart.ToolGroup>
              {!workflow.report && workflow.error ? (
                <Button size="sm" variant="ghost" onPress={feedback}>
                  {t('diagnosis.feedback')}
                </Button>
              ) : null}
            </>
          ) : view.kind === 'analysis' ? (
            <View className="gap-6">
              {workflow.ai ? (
                <DiagnosticAiResult report={workflow.ai} />
              ) : (
                <View accessibilityLiveRegion="polite" className="gap-4">
                  <Text accessibilityRole="header" className="text-lg font-medium text-foreground">
                    {workflow.error
                      ? t(`diagnosis.error.${workflow.error}`)
                      : t('diagnosis.aiRunning')}
                  </Text>
                  {workflow.busy === 'ai' ? (
                    <View className="flex-row items-center gap-3">
                      <Spinner size="sm" />
                      <Text className="text-sm text-muted-foreground">{model?.model.name}</Text>
                    </View>
                  ) : null}
                </View>
              )}
              <View className="gap-2">
                <Text accessibilityRole="header" className="text-sm font-medium text-foreground">
                  {t('diagnosis.evidence')}
                </Text>
                <DiagnosticCheckEvidence checks={checks} summary={summary} />
                {workflow.evidence.map((entry) => (
                  <DiagnosticEvidenceDetail key={entry.id} evidence={entry} target={target} />
                ))}
              </View>
              {workflow.ai ? (
                <Text className="text-xs text-muted-foreground">
                  {workflow.ai.modelName}
                  {model ? ` \u00B7 ${model.provider.name}` : ''}
                </Text>
              ) : null}
            </View>
          ) : (
            <DiagnosticCheckDetail check={view.entry} onSettings={settings} />
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

function DiagnosticCheckStatus({ check }: { check: DiagnosticCheck }) {
  const { t } = useTranslation();

  return (
    <View className="min-w-0 flex-row items-center gap-2">
      {check.status === 'pending' ? (
        <Spinner size="sm" />
      ) : needsAttention(check) ? (
        <CircleAlertIcon className="size-4 text-warning" />
      ) : check.status === 'skipped' ? (
        <ClockIcon className="size-4 text-muted-foreground" />
      ) : (
        <CheckIcon className="size-4 text-muted-foreground" />
      )}
      <Text
        className={
          needsAttention(check)
            ? 'shrink text-xs text-warning'
            : 'shrink text-xs text-muted-foreground'
        }
      >
        {t(
          check.id === 'endpoint' && check.status === 'pass'
            ? 'diagnosis.endpointReachable'
            : check.issue === 'not_initialized'
              ? 'diagnosis.notInitialized'
              : check.status === 'pending'
                ? 'diagnosis.running'
                : statusKeys[check.status],
        )}
      </Text>
    </View>
  );
}

function DiagnosticCheckEvidence({
  checks,
  summary,
}: {
  checks: DiagnosticCheck[];
  summary: string;
}) {
  const { t, i18n } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const numbers = new Intl.NumberFormat(i18n.resolvedLanguage);

  return (
    <View className="gap-2">
      <Section.Item
        accessibilityLabel={`${t('diagnosis.applicationChecks')}, ${summary}`}
        accessibilityState={{ expanded: isExpanded }}
        density="compact"
        description={<Text className="text-xs text-muted-foreground">{summary}</Text>}
        inset="none"
        label={<Text className="text-sm text-foreground">{t('diagnosis.applicationChecks')}</Text>}
        onPress={() => setIsExpanded(!isExpanded)}
        testID="diagnosis-check-evidence"
        trailing={
          isExpanded ? (
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          )
        }
      />
      {isExpanded ? (
        <Section variant="plain" className="pb-3" contentClassName="gap-2">
          {checks.map((check) => (
            <View key={check.id} className="gap-2">
              <Section.Item
                density="compact"
                description={
                  check.issue ? (
                    <Text className="text-xs text-muted-foreground">
                      {t(issueKeys[check.issue])}
                    </Text>
                  ) : undefined
                }
                inset="none"
                label={<Text className="text-sm text-foreground">{t(checkKeys[check.id])}</Text>}
                trailing={<DiagnosticCheckStatus check={check} />}
              />
              {Object.entries(check.facts ?? {}).map(([key, value]) => (
                <View key={key} className="flex-row flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Text className="min-w-24 flex-1 text-xs text-muted-foreground">
                    {t(factKeys[key])}
                  </Text>
                  <Text className="max-w-full shrink text-right text-xs text-foreground" selectable>
                    {numbers.format(Number(value))}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function DiagnosticIncident({ context }: { context: DiagnosticFeedbackContext }) {
  const { t } = useTranslation();
  return (
    <View className="gap-3">
      <Text className="text-sm text-muted-foreground">{t('diagnosis.attachmentDescription')}</Text>
      {context.error ? (
        <Text className="font-mono text-sm text-foreground" selectable>
          {JSON.stringify(context.error, null, 2)}
        </Text>
      ) : (
        <Text className="text-sm text-muted-foreground">{t('diagnosis.evidenceUnavailable')}</Text>
      )}
    </View>
  );
}

function DiagnosticCheckDetail({
  check,
  onSettings,
}: {
  check: DiagnosticCheck;
  onSettings: (check: DiagnosticCheck) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const numbers = new Intl.NumberFormat(i18n.resolvedLanguage);
  return (
    <>
      <Text className="text-lg font-medium text-foreground">
        {t(
          check.id === 'endpoint' && check.status === 'pass'
            ? 'diagnosis.endpointReachable'
            : statusKeys[check.status],
        )}
      </Text>
      {check.issue ? (
        <Text className="text-base text-foreground">{t(issueKeys[check.issue])}</Text>
      ) : null}
      {Object.entries(check.facts ?? {}).map(([key, value]) => (
        <View key={key} className="flex-row justify-between gap-4">
          <Text className="flex-1 text-sm text-muted-foreground">{t(factKeys[key])}</Text>
          <Text className="text-sm text-foreground" selectable>
            {numbers.format(Number(value))}
          </Text>
        </View>
      ))}
      <Text className="text-sm text-muted-foreground">
        {t(
          check.id === 'endpoint'
            ? 'diagnosis.endpointNote'
            : check.id === 'data'
              ? 'diagnosis.dataNote'
              : check.id === 'runtime'
                ? 'diagnosis.runtimeNote'
                : 'diagnosis.analysisNote',
        )}
      </Text>
      {needsAttention(check) ? (
        <Button variant="secondary" onPress={() => void onSettings(check)}>
          {t(check.id === 'runtime' ? 'diagnosis.feedback' : 'diagnosis.openSettings')}
        </Button>
      ) : null}
    </>
  );
}
