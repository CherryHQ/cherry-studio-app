import { SettingsIcon } from '@cherrystudio/app-icons';
import {
  isProviderConfigurationToolName,
  providerConfigurationSummarySchema,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ToolPartTextSection } from './ToolPartDetails';
import { ToolPartDisclosure } from './ToolPartDisclosure';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

export function isProviderConfigToolPart(part: ToolMessagePart): boolean {
  return isProviderConfigurationToolName(getToolName(part));
}

export function ProviderConfigToolPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const router = useRouter();
  const summary =
    part.state === 'output-available'
      ? providerConfigurationSummarySchema.safeParse(part.output).data
      : undefined;
  const title = summary?.providerName || t('chat.providerConfig.title');
  const openSettings = useCallback(() => {
    if (!summary) return;
    router.push({
      params: { providerId: summary.providerId, providerName: summary.providerName },
      pathname: '/settings/provider/[providerId]',
    });
  }, [router, summary]);
  const isRunning =
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval.approved);

  return (
    <ToolPartDisclosure
      icon={SettingsIcon}
      isRunning={isRunning}
      statusText={getStatusText(part, summary?.providerName, t)}
      statusTone={getStatusTone(part)}
      testIDPrefix="provider-config-tool-part"
      title={title}
    >
      {summary ? (
        <View className="gap-3">
          <ToolPartTextSection
            title={t('chat.providerConfig.origin')}
            value={summary.origin || t('chat.providerConfig.notSet')}
          />
          <ToolPartTextSection
            title={t('chat.providerConfig.apiKey')}
            value={
              summary.apiKeyAdded
                ? t('chat.providerConfig.willAdd')
                : t('chat.providerConfig.unchanged')
            }
          />
          <SummaryCount
            label={t('chat.providerConfig.modelsAdded')}
            value={summary.modelsAdded.length}
          />
          <SummaryCount
            label={t('chat.providerConfig.modelsRemoved')}
            value={summary.modelsRemoved.length}
          />
          {summary.modelsSkipped.length > 0 ? (
            <SummaryCount
              label={t('chat.providerConfig.modelsSkipped')}
              value={summary.modelsSkipped.length}
            />
          ) : null}
          <Text
            accessibilityRole="link"
            className="py-2 font-medium text-primary text-base"
            onPress={openSettings}
          >
            {t('chat.providerConfig.openSettings')}
          </Text>
        </View>
      ) : part.state === 'output-error' ? (
        <ToolPartTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
      ) : (
        <Text className="text-foreground-tertiary text-sm">
          {getStatusText(part, undefined, t)}
        </Text>
      )}
    </ToolPartDisclosure>
  );
}

function SummaryCount({ label, value }: { label: string; value: number }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="min-w-0 flex-1 text-foreground text-base">{label}</Text>
      <Text className="shrink-0 font-medium text-foreground text-base">{value}</Text>
    </View>
  );
}

function getStatusText(
  part: ToolMessagePart,
  providerName: string | undefined,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (part.state === 'input-streaming') return t('chat.tool.preparingInput');
  if (part.state === 'input-available') return t('chat.tool.inputReady');
  if (part.state === 'approval-requested') return t('chat.tool.approvalRequested');
  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.tool.approved') : t('chat.tool.runDenied');
  }
  if (part.state === 'output-available') {
    return providerName ? t('chat.providerConfig.configured') : t('chat.tool.result');
  }
  if (part.state === 'output-error') return t('chat.tool.callError');
  return t('chat.tool.runDenied');
}

function getStatusTone(part: ToolMessagePart): 'danger' | 'default' | 'warning' {
  if (
    part.state === 'output-denied' ||
    (part.state === 'approval-responded' && !part.approval.approved)
  ) {
    return 'warning';
  }
  return part.state === 'output-error' ? 'danger' : 'default';
}

function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}
