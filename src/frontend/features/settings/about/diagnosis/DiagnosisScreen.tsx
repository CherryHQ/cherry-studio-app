import ActivityIcon from '@cherrystudio/app-icons/icons/activity';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import ClockIcon from '@cherrystudio/app-icons/icons/clock';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import {
  BottomSheet,
  Button,
  ContentState,
  MessagePart,
  Section,
  Spinner,
  useAlert,
} from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useFeedbackActions, useFeedbackCapture } from '@/frontend/appShell/feedback';
import { ModelPickerDrawer, type ModelPickerModelItem } from '@/frontend/components/ModelPicker';
import type { DiagnosticCheck, DiagnosticEvidence } from '@/shared/contracts/diagnosticSession';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';
import { DiagnosticAiResult } from './DiagnosticAiResult';
import { DiagnosticEvidenceDetail } from './DiagnosticEvidenceDetail';
import { checkKeys, factKeys, issueKeys, statusKeys } from './diagnosticLabels';
import { useDiagnosticSession } from './useDiagnosticSession';

export function DiagnosisScreen() {
  const captured = useFeedbackCapture();
  const [context] = useState(captured.context);
  const workflow = useDiagnosticSession(context);
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { openFeedback } = useFeedbackActions();
  const [showAi, setShowAi] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [model, setModel] = useState<ModelPickerModelItem>();
  const [detail, setDetail] = useState<DiagnosticCheck | DiagnosticEvidence>();
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const selectModel = useCallback((selected: ModelPickerModelItem) => {
    setModel(selected);
    setPickerOpen(false);
  }, []);
  const isModelVisible = useCallback(
    (item: ModelPickerModelItem) =>
      item.model.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL),
    [],
  );
  const busy = workflow.busy !== undefined;
  const checks = workflow.checks;
  const finding =
    checks.find((check) => check.status === 'fail' || check.status === 'error') ??
    checks.find((check) => check.status === 'warn') ??
    checks.find((check) => check.id === 'model' && check.status === 'skipped');
  const hasNetwork = checks.some((check) => check.id === 'endpoint');
  const summary = finding?.issue
    ? t(issueKeys[finding.issue])
    : finding
      ? t('diagnosis.needsAttention')
      : t('diagnosis.passed');
  const target = workflow.report?.target;
  const settingsLabel = target
    ? t('diagnosis.providerSettings', { provider: target.providerName })
    : t('diagnosis.openSettings');

  function feedback() {
    const input = context ?? { feature: 'other' as const };
    void openFeedback(input, {
      diagnosis: workflow.report
        ? { checkedAt: workflow.report.checkedAt, checks, aiCompleted: Boolean(workflow.ai) }
        : undefined,
    });
  }

  function conversation() {
    alert.confirm({
      title: t('diagnosis.confirmConversation'),
      description: t('diagnosis.conversationCost'),
      confirmLabel: t('diagnosis.start'),
      onConfirm: () => {
        void workflow.checkConversation();
      },
    });
  }

  function settings(check?: DiagnosticCheck) {
    if (check?.id === 'permissions') {
      router.push('/settings/permissions');
      return;
    }
    if (check?.id === 'storage') {
      router.push('/settings/data');
      return;
    }
    if (check?.id === 'plugins') {
      router.push('/plugins');
      return;
    }
    const providerId = workflow.report?.target?.providerId;
    if (providerId)
      router.push({ pathname: '/settings/provider/[providerId]', params: { providerId } });
    else router.push('/settings/model');
  }

  function facts(check: DiagnosticCheck) {
    return Object.entries(check.facts ?? {}).map(([key, value]) => ({
      key: t(factKeys[key] ?? key),
      value:
        key === 'freeBytes' && typeof value === 'number'
          ? `${new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }).format(value / 1024 ** 3)} GB`
          : new Intl.NumberFormat(i18n.resolvedLanguage).format(Number(value)),
    }));
  }

  return (
    <View className="flex-1 bg-background">
      <SettingsScrollPage
        contentClassName="gap-6"
        headerProps={{
          onBack: showAi
            ? () => {
                workflow.cancel();
                setShowAi(false);
              }
            : undefined,
          title: t(
            showAi
              ? workflow.ai
                ? 'diagnosis.aiResult'
                : 'diagnosis.aiTitle'
              : context
                ? 'diagnosis.title'
                : 'diagnosis.systemTitle',
          ),
        }}
      >
        {target ? (
          <View className="gap-1 px-1">
            <Text className="text-xs text-muted-foreground">
              {t(context ? 'diagnosis.targetModel' : 'diagnosis.checkedModel')}
            </Text>
            <Text className="text-base font-medium text-foreground">
              {target.modelName}
              <Text className="font-normal text-muted-foreground"> · {target.providerName}</Text>
            </Text>
          </View>
        ) : null}

        {workflow.busy ? (
          <View accessibilityLiveRegion="polite" className="flex-row items-center gap-3 px-1">
            <Spinner size="sm" />
            <Text className="flex-1 text-base text-foreground">
              {t(workflow.busy === 'ai' ? 'diagnosis.aiRunning' : 'diagnosis.running')}
            </Text>
            <Button size="sm" variant="ghost" onPress={workflow.cancel}>
              {t('common.cancel')}
            </Button>
          </View>
        ) : null}
        {workflow.error ? (
          <View accessibilityLiveRegion="polite" className="gap-2 px-1">
            <Text className="text-sm text-error-subtle-foreground">
              {t(`diagnosis.error.${workflow.error}`)}
            </Text>
          </View>
        ) : null}

        {showAi ? (
          <>
            {workflow.ai ? (
              <View className="px-1">
                <DiagnosticAiResult
                  report={workflow.ai}
                  title={finding ? summary : t('diagnosis.conclusion')}
                />
              </View>
            ) : !busy && !workflow.error ? (
              <ContentState.Empty title={t('diagnosis.aiTitle')} />
            ) : null}
            {workflow.evidence.length ? (
              <MessagePart.ToolGroup
                state={workflow.busy === 'ai' ? 'running' : 'complete'}
                statusText={new Intl.NumberFormat(i18n.resolvedLanguage).format(
                  workflow.evidence.length,
                )}
                testID="diagnosis-evidence"
                title={t('diagnosis.evidence')}
              >
                <Section>
                  {workflow.evidence.map((entry) => (
                    <Section.Item
                      key={entry.id}
                      label={t(`diagnosis.tool.${entry.tool}`)}
                      leading={<FileTextIcon className="size-4 text-muted-foreground" />}
                      onPress={() => setDetail(entry)}
                    />
                  ))}
                </Section>
              </MessagePart.ToolGroup>
            ) : null}
            {workflow.ai ? (
              <View className="gap-4 px-1">
                <Text className="text-xs text-muted-foreground">{t('diagnosis.analysisNote')}</Text>
                <View className="gap-1">
                  <Text className="text-xs text-muted-foreground">
                    {t('diagnosis.diagnosticModel')}
                  </Text>
                  <Text className="text-sm text-foreground">{workflow.ai.modelName}</Text>
                  <View className="items-start">
                    <Button
                      disabled={busy}
                      size="inline"
                      variant="text"
                      onPress={() => {
                        setShowAi(false);
                        setPickerOpen(true);
                      }}
                    >
                      {t('diagnosis.changeModel')}
                    </Button>
                  </View>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <>
            {workflow.report && !busy ? (
              <View className="gap-2 px-1">
                <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">
                  {summary}
                </Text>
              </View>
            ) : null}
            {checks.length ? (
              <Section title={t('diagnosis.applicationChecks')}>
                {checks.map((check) => (
                  <Section.Item
                    key={check.id}
                    label={t(checkKeys[check.id])}
                    leading={
                      check.status === 'pass' ? (
                        <CheckIcon className="size-4 text-success" />
                      ) : check.status === 'pending' || check.status === 'skipped' ? (
                        <ClockIcon className="size-4 text-muted-foreground" />
                      ) : (
                        <CircleAlertIcon className="size-4 text-error-subtle-foreground" />
                      )
                    }
                    trailing={
                      <Text className="text-xs text-muted-foreground">
                        {t(
                          check.id === 'endpoint' && check.status === 'pass'
                            ? 'diagnosis.endpointReachable'
                            : statusKeys[check.status],
                        )}
                      </Text>
                    }
                    onPress={() => setDetail(check)}
                  />
                ))}
              </Section>
            ) : null}
            {!context && !hasNetwork && workflow.report ? (
              <Button
                disabled={busy || !workflow.report.target}
                variant="secondary"
                onPress={() => void workflow.check(true)}
              >
                {t('diagnosis.checkConnection')}
              </Button>
            ) : null}
            {workflow.report ? (
              <View className="gap-2">
                <Section title={t('diagnosis.aiTitle')}>
                  <Section.SelectItem
                    disabled={busy}
                    label={t('diagnosis.diagnosticModel')}
                    value={model?.model.name ?? t('diagnosis.chooseModel')}
                    onPress={() => setPickerOpen(true)}
                  />
                </Section>
                <Text className="px-1 text-xs text-muted-foreground">{t('diagnosis.aiCost')}</Text>
              </View>
            ) : null}
          </>
        )}
      </SettingsScrollPage>

      <View className="gap-2 px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        {showAi ? (
          <Button
            disabled={busy || (!workflow.ai && !model)}
            onPress={() => {
              if (workflow.ai) settings();
              else if (workflow.error === 'stale') {
                setShowAi(false);
                void workflow.check(context !== undefined || hasNetwork);
              } else if (model) void workflow.diagnose(model.modelId);
            }}
          >
            {workflow.ai
              ? settingsLabel
              : t(workflow.error === 'stale' ? 'diagnosis.recheck' : 'common.retry')}
          </Button>
        ) : (
          <Button
            disabled={busy || !model || !workflow.report}
            icon={<ActivityIcon />}
            onPress={() => {
              if (model) {
                setShowAi(true);
                void workflow.diagnose(model.modelId);
              }
            }}
          >
            {t('diagnosis.startAi')}
          </Button>
        )}
        <View className="flex-row items-center justify-center gap-6">
          {!showAi ? (
            <Button
              disabled={busy}
              size="sm"
              variant="ghost"
              onPress={() => void workflow.check(context !== undefined || hasNetwork)}
            >
              {t('diagnosis.recheck')}
            </Button>
          ) : null}
          <Button disabled={busy} size="sm" variant="ghost" onPress={feedback}>
            {t('diagnosis.feedback')}
          </Button>
        </View>
      </View>

      {pickerOpen ? (
        <ModelPickerDrawer
          modelType="text"
          variant="chat"
          isModelVisible={isModelVisible}
          open
          onClose={closePicker}
          onSelect={selectModel}
          selectedModelId={model?.modelId ?? null}
          title={t('diagnosis.diagnosticModel')}
          onAddProvider={() => {
            setPickerOpen(false);
            router.push('/settings/provider');
          }}
        />
      ) : null}
      {detail ? (
        <BottomSheet
          open
          size="large"
          onClose={() => setDetail(undefined)}
          title={'tool' in detail ? t(`diagnosis.tool.${detail.tool}`) : t(checkKeys[detail.id])}
        >
          <ScrollView contentContainerClassName="gap-4 px-5 pb-6">
            {'tool' in detail ? (
              <DiagnosticEvidenceDetail evidence={detail} target={target} />
            ) : (
              <>
                <Text className="text-base text-foreground">
                  {t(
                    detail.id === 'endpoint' && detail.status === 'pass'
                      ? 'diagnosis.endpointReachable'
                      : statusKeys[detail.status],
                  )}
                </Text>
                {detail.issue ? (
                  <Text className="text-sm text-muted-foreground">
                    {t(issueKeys[detail.issue])}
                  </Text>
                ) : null}
                {facts(detail).map((fact) => (
                  <View key={fact.key} className="flex-row justify-between gap-4">
                    <Text className="text-sm text-muted-foreground">{fact.key}</Text>
                    <Text className="text-sm text-foreground" selectable>
                      {fact.value}
                    </Text>
                  </View>
                ))}
                {detail.id === 'endpoint' && workflow.report?.target?.endpointHost ? (
                  <Text className="font-mono text-sm text-foreground" selectable>
                    {workflow.report.target.endpointHost}
                  </Text>
                ) : null}
                {detail.id === 'endpoint' && detail.status === 'pass' ? (
                  <Text className="text-sm text-muted-foreground">
                    {t('diagnosis.endpointNote')}
                  </Text>
                ) : null}
                {detail.id === 'conversation' && detail.status !== 'skipped' ? (
                  <Button
                    disabled={busy}
                    onPress={() => {
                      setDetail(undefined);
                      conversation();
                    }}
                  >
                    {t('diagnosis.verifyConversation')}
                  </Button>
                ) : null}
                {detail.status === 'fail' ||
                detail.status === 'warn' ||
                detail.status === 'error' ? (
                  <Button
                    variant="secondary"
                    onPress={() => {
                      setDetail(undefined);
                      settings(detail);
                    }}
                  >
                    {t('diagnosis.openSettings')}
                  </Button>
                ) : null}
              </>
            )}
          </ScrollView>
        </BottomSheet>
      ) : null}
    </View>
  );
}
