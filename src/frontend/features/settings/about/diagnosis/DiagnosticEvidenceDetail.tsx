import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { z } from 'zod';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
import {
  DiagnosticCheckSchema,
  type DiagnosticEvidence,
  type DiagnosticReport,
} from '@/shared/contracts/diagnosticSession';
import type { ProviderConfigurationIssue } from '@/shared/contracts/providers';

import { factKeys, issueKeys, statusKeys } from './diagnosticLabels';

const configurationSchema = z.object({
  configurationIssue: z.string().nullable(),
  endpointHost: z.string().nullable(),
  remoteExecution: z.boolean(),
});
const pluginSchema = z.object({
  enabledCount: z.number().int().nonnegative(),
  connectedCount: z.number().int().nonnegative(),
});
const configurationIssueKeys = {
  'missing-oauth': 'settings.provider.setup.issues.missing-oauth',
  'missing-api-key': 'diagnosis.missingApiKey',
  'disabled-api-keys': 'settings.provider.setup.issues.disabled-api-keys',
  'invalid-service-account': 'settings.provider.setup.issues.invalid-service-account',
  'invalid-endpoint': 'settings.provider.setup.issues.invalid-endpoint',
  'unsupported-auth': 'settings.provider.setup.issues.unsupported-auth',
  'disabled-provider': 'settings.provider.status.disabled',
} satisfies Record<ProviderConfigurationIssue | 'disabled-provider', string>;

export function DiagnosticEvidenceDetail({
  evidence,
  target,
}: {
  evidence: DiagnosticEvidence;
  target: DiagnosticReport['target'];
}) {
  const { t, i18n } = useTranslation();
  const numbers = new Intl.NumberFormat(i18n.resolvedLanguage);
  const facts: { label: string; value: string }[] = [];
  let isEndpointReachable = false;
  let endpointIssue: string | undefined;
  let data: unknown;
  try {
    data = JSON.parse(evidence.facts);
  } catch {
    // Keep an unexpected result available as raw data without inventing a summary.
  }

  if (evidence.tool === 'configuration') {
    const result = configurationSchema.safeParse(data);
    if (result.success) {
      if (target) {
        facts.push(
          { label: t('chat.errorPart.detail.provider'), value: target.providerName },
          { label: t('chat.errorPart.detail.model'), value: target.modelName },
        );
      }
      const issueKey = Object.entries(configurationIssueKeys).find(
        ([issue]) => issue === result.data.configurationIssue,
      )?.[1];
      facts.push({
        label: t('diagnosis.check.model'),
        value: issueKey
          ? t(issueKey)
          : t(
              !target
                ? 'diagnosis.issue.missing_model'
                : result.data.configurationIssue === null
                  ? 'diagnosis.configurationReady'
                  : 'diagnosis.issue.configuration',
            ),
      });
      facts.push({
        label: t('diagnosis.executionLocation'),
        value: t(result.data.remoteExecution ? 'diagnosis.onDesktop' : 'diagnosis.onDevice'),
      });
      if (result.data.endpointHost)
        facts.push({ label: t('diagnosis.endpointHost'), value: result.data.endpointHost });
    }
  } else if (evidence.tool === 'endpoint') {
    const result = DiagnosticCheckSchema.safeParse(data);
    if (result.success && result.data.id === 'endpoint') {
      isEndpointReachable = result.data.status === 'pass';
      endpointIssue = result.data.issue ? t(issueKeys[result.data.issue]) : undefined;
      facts.push({
        label: t('diagnosis.check.endpoint'),
        value: t(
          isEndpointReachable ? 'diagnosis.endpointReachable' : statusKeys[result.data.status],
        ),
      });
      if (target?.endpointHost)
        facts.push({ label: t('diagnosis.endpointHost'), value: target.endpointHost });
      for (const key of ['httpStatus', 'latencyMs'] as const) {
        const value = result.data.facts?.[key];
        if (value !== undefined)
          facts.push({ label: t(factKeys[key]), value: numbers.format(value) });
      }
    }
  } else if (evidence.tool === 'plugins') {
    const result = pluginSchema.safeParse(data);
    if (result.success) {
      facts.push(
        {
          label: t('diagnosis.fact.enabledCount'),
          value: numbers.format(result.data.enabledCount),
        },
        {
          label: t('diagnosis.fact.connectedCount'),
          value: numbers.format(result.data.connectedCount),
        },
      );
    }
  } else if (evidence.tool === 'logs' && Array.isArray(data)) {
    facts.push({ label: t('diagnosis.fact.recordCount'), value: numbers.format(data.length) });
  }

  return (
    <View className="gap-6">
      {facts.length ? (
        <View className="gap-4">
          {facts.map((fact) => (
            <View key={fact.label} className="flex-row flex-wrap items-baseline gap-x-6 gap-y-1">
              <Text className="min-w-24 flex-1 text-sm text-muted-foreground">{fact.label}</Text>
              <Text className="max-w-full shrink text-right text-sm text-foreground" selectable>
                {fact.value}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">{t('diagnosis.evidenceUnavailable')}</Text>
      )}
      {endpointIssue ? (
        <Text className="text-sm text-muted-foreground">{endpointIssue}</Text>
      ) : null}
      {isEndpointReachable ? (
        <Text className="text-sm text-muted-foreground">{t('diagnosis.endpointNote')}</Text>
      ) : null}
      <MessagePart.ToolGroup
        state="complete"
        testID="diagnosis-evidence-raw"
        title={t('diagnosis.rawData')}
      >
        <MessageDetailText
          language="json"
          title={t('diagnosis.rawData')}
          value={evidence.facts}
          variant="code"
        />
      </MessagePart.ToolGroup>
    </View>
  );
}
