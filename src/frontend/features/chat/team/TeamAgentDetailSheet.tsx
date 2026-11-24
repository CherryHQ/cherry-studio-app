import { BottomSheet, ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useTeamAgentDetail } from '@/frontend/appShell/conversation/team';
import type { TeamAgentModule } from '@/shared/contracts/teamAgent';

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
  const { detail, error, retry } = useTeamAgentDetail(module, agentId);
  return (
    <BottomSheet open onClose={onClose} size="content" title={t('teamAgent.details')}>
      <View className="gap-5 px-5 py-4">
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
        ) : error ? (
          <ContentState.Error
            title={t('teamAgent.unavailable')}
            primaryAction={{
              children: t('common.retry'),
              onPress: retry,
            }}
          />
        ) : (
          <ContentState.Loading title={t('remoteAgent.loading')} />
        )}
      </View>
    </BottomSheet>
  );
}
