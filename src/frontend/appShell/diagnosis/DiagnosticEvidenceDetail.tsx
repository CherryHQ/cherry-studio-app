import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
import {
  type DiagnosticEvidence,
  type DiagnosticReport,
} from '@/shared/contracts/diagnosticSession';

import { configurationIssueKeys, factKeys, issueKeys, statusKeys } from './diagnosticLabels';

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
  if (!('unavailable' in evidence)) {
    switch (evidence.tool) {
      case 'configuration': {
        const data = evidence.data;
        if (target) {
          facts.push(
            { label: t('chat.errorPart.detail.provider'), value: target.providerName },
            { label: t('chat.errorPart.detail.model'), value: target.modelName },
          );
        }
        const issueKey = data.configurationIssue
          ? configurationIssueKeys[data.configurationIssue]
          : undefined;
        facts.push({
          label: t('diagnosis.check.model'),
          value: issueKey
            ? t(issueKey)
            : t(
                !target
                  ? 'diagnosis.issue.missing_model'
                  : data.configurationIssue === null
                    ? 'diagnosis.configurationReady'
                    : 'diagnosis.issue.configuration',
              ),
        });
        facts.push({
          label: t('diagnosis.executionLocation'),
          value: t(data.remoteExecution ? 'diagnosis.onDesktop' : 'diagnosis.onDevice'),
        });
        if (data.endpointHost)
          facts.push({ label: t('diagnosis.endpointHost'), value: data.endpointHost });
        break;
      }
      case 'endpoint': {
        const data = evidence.data;
        isEndpointReachable = data.status === 'pass';
        endpointIssue = data.issue ? t(issueKeys[data.issue]) : undefined;
        facts.push({
          label: t('diagnosis.check.endpoint'),
          value: t(isEndpointReachable ? 'diagnosis.endpointReachable' : statusKeys[data.status]),
        });
        if (target?.endpointHost)
          facts.push({ label: t('diagnosis.endpointHost'), value: target.endpointHost });
        for (const key of ['httpStatus', 'latencyMs'] as const) {
          const value = data.facts?.[key];
          if (value !== undefined)
            facts.push({ label: t(factKeys[key]), value: numbers.format(value) });
        }
        break;
      }
      case 'plugins': {
        const data = evidence.data;
        facts.push(
          {
            label: t('diagnosis.fact.enabledCount'),
            value: numbers.format(data.enabledCount),
          },
          {
            label: t('diagnosis.fact.connectedCount'),
            value: numbers.format(data.connectedCount),
          },
        );
        break;
      }
      case 'logs':
        facts.push({
          label: t('diagnosis.fact.recordCount'),
          value: numbers.format(evidence.data.length),
        });
        break;
      default: {
        const unexpected: never = evidence;
        throw new Error(`Unsupported diagnostic evidence: ${unexpected}`);
      }
    }
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
          value={JSON.stringify(
            'unavailable' in evidence
              ? { status: 'unavailable', reason: evidence.unavailable }
              : evidence.data,
            null,
            2,
          )}
          variant="code"
        />
      </MessagePart.ToolGroup>
    </View>
  );
}
