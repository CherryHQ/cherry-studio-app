import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Button, MessagePart, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useCopyDetailText } from '@/frontend/components/MessageDetail';
import type { DiagnosticEvidence, DiagnosticReport } from '@/shared/contracts/diagnosticSession';

import { configurationIssueKeys, factKeys, issueKeys, statusKeys } from './diagnosticLabels';

export function DiagnosticEvidenceDetail({
  evidence,
  target,
}: {
  evidence: DiagnosticEvidence;
  target: DiagnosticReport['target'];
}) {
  const { t, i18n } = useTranslation();
  const copy = useCopyDetailText();
  const [isExpanded, setIsExpanded] = useState(false);
  const title = t(`diagnosis.tool.${evidence.tool}`);
  const numbers = new Intl.NumberFormat(i18n.resolvedLanguage);
  const facts: { label: string; value: string }[] = [];
  let summary = t('diagnosis.evidenceUnavailable');
  let isEndpointReachable = false;
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
        summary = issueKey
          ? t(issueKey)
          : target
            ? `${target.providerName} \u00B7 ${target.modelName}`
            : t('diagnosis.issue.missing_model');
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
        summary = data.issue
          ? t(issueKeys[data.issue])
          : t(isEndpointReachable ? 'diagnosis.endpointReachable' : statusKeys[data.status]);
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
        summary = facts.map((fact) => `${fact.label} ${fact.value}`).join(' \u00B7 ');
        break;
      }
      case 'logs': {
        summary = `${t('diagnosis.fact.recordCount')} ${numbers.format(evidence.data.length)}`;
        facts.push({
          label: t('diagnosis.fact.recordCount'),
          value: numbers.format(evidence.data.length),
        });
        break;
      }
      default: {
        const unexpected: never = evidence;
        throw new Error(`Unsupported diagnostic evidence: ${unexpected}`);
      }
    }
  }

  function copyRawData() {
    void copy(() =>
      JSON.stringify(
        'unavailable' in evidence
          ? { status: 'unavailable', reason: evidence.unavailable }
          : evidence.data,
        null,
        2,
      ),
    );
  }

  return (
    <View className="gap-2">
      <Section.Item
        accessibilityLabel={`${title}, ${summary}`}
        accessibilityState={{ expanded: isExpanded }}
        density="compact"
        description={<Text className="text-xs text-muted-foreground">{summary}</Text>}
        inset="none"
        label={<Text className="text-sm text-foreground">{title}</Text>}
        onPress={() => setIsExpanded(!isExpanded)}
        testID={`diagnosis-evidence-${evidence.id}`}
        trailing={
          isExpanded ? (
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          )
        }
      />
      {isExpanded ? (
        <View className="gap-2 pb-3">
          {facts.map((fact) => (
            <View key={fact.label} className="flex-row flex-wrap items-baseline gap-x-3 gap-y-1">
              <Text className="min-w-24 flex-1 text-xs text-muted-foreground">{fact.label}</Text>
              <Text className="max-w-full shrink text-right text-xs text-foreground" selectable>
                {fact.value}
              </Text>
            </View>
          ))}
          {isEndpointReachable ? (
            <Text className="text-xs text-muted-foreground">{t('diagnosis.endpointNote')}</Text>
          ) : null}
          {evidence.tool === 'logs' && !('unavailable' in evidence) && evidence.data.length > 0 ? (
            <MessagePart.TextBody value={JSON.stringify(evidence.data, null, 2)} />
          ) : null}
          <View className="items-end">
            <Button
              onPress={copyRawData}
              size="inline"
              testID={`diagnosis-evidence-${evidence.id}-copy`}
              variant="text"
            >
              {t('diagnosis.copyRawData')}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
