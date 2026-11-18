import { BottomSheet, ContentState } from '@cherrystudio/ui/components';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import type { TeamAgentDetail, TeamAgentModule } from '@/shared/contracts/teamAgent';

export function TeamAgentDetailSheet({
  module,
  agentId,
  onClose,
}: {
  module: TeamAgentModule;
  agentId: string;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{
    key: string;
    detail?: TeamAgentDetail;
    error?: boolean;
  }>();
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([agentId, attempt]);
  useEffect(() => {
    const lifetime = new AbortController();
    void module.readDetail(agentId, lifetime.signal).then(
      (detail) => {
        if (!lifetime.signal.aborted) setResult({ key: requestKey, detail });
      },
      () => {
        if (!lifetime.signal.aborted) setResult({ key: requestKey, error: true });
      },
    );
    return () => lifetime.abort();
  }, [module, agentId, requestKey]);
  const current = result?.key === requestKey ? result : undefined;
  const detail = current?.detail;
  return (
    <BottomSheet open onClose={onClose} title={t('teamAgent.details')}>
      <ScrollView className="max-h-96" contentContainerClassName="gap-5 px-5 py-4">
        {detail ? (
          <>
            {detail.model ? (
              <View className="gap-1">
                <Text className="text-sm text-muted-foreground">{t('agent.form.model')}</Text>
                <Text selectable className="text-base text-foreground">
                  {detail.model}
                </Text>
              </View>
            ) : null}
            {detail.skills.length ? (
              <View className="gap-2">
                <Text className="text-sm text-muted-foreground">{t('skills.title')}</Text>
                {detail.skills.map((skill) => (
                  <View key={skill.name} className="gap-1">
                    <Text className="text-base text-foreground">
                      {skill.name} ·{' '}
                      {t(skill.disabled ? 'teamAgent.disabled' : 'teamAgent.enabled')}
                    </Text>
                    <Text className="text-sm text-muted-foreground">{skill.description}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {detail.mcp.length ? (
              <View className="gap-2">
                <Text className="text-sm text-muted-foreground">MCP</Text>
                {detail.mcp.map((server) => (
                  <Text key={server.name} className="text-base text-foreground">
                    {server.name} · {t(server.enabled ? 'teamAgent.enabled' : 'teamAgent.disabled')}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        ) : current?.error ? (
          <ContentState.Error
            title={t('teamAgent.unavailable')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => setAttempt((value) => value + 1),
            }}
          />
        ) : (
          <ContentState.Loading title={t('remoteAgent.loading')} />
        )}
      </ScrollView>
    </BottomSheet>
  );
}
