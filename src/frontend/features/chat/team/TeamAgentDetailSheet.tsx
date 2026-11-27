import { BottomSheet, ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useTeamAgentDetail } from '@/frontend/appShell/conversation/team';
import { CloudMark } from '@/frontend/components/CloudMark';
import type { TeamAgent, TeamAgentModule } from '@/shared/contracts/teamAgent';

export function TeamAgentDetailSheet({
  module,
  agent,
  onClose,
}: {
  module: TeamAgentModule;
  agent: TeamAgent;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const { detail, error, retry } = useTeamAgentDetail(module, agent.id);
  const hasDetails = Boolean(detail && (detail.model || detail.skills.length || detail.mcp.length));
  return (
    <BottomSheet open onClose={onClose} size="content" title={t('teamAgent.details')}>
      <View className="gap-5 px-5 py-4">
        <View className="gap-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="shrink font-semibold text-base text-foreground">{agent.name}</Text>
            <CloudMark />
          </View>
          {agent.groupName && agent.groupName !== agent.name ? (
            <Text className="text-sm text-muted-foreground">{agent.groupName}</Text>
          ) : null}
          {agent.description ? (
            <Text className="text-sm text-muted-foreground">{agent.description}</Text>
          ) : null}
        </View>
        {detail ? (
          <>
            {hasDetails ? (
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
                        {server.name} ·{' '}
                        {t(server.enabled ? 'teamAgent.enabled' : 'teamAgent.disabled')}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <ContentState.Empty title={t('teamAgent.noDetails')} />
            )}
            <Text className="text-xs text-muted-foreground">{t('teamAgent.memoryNotice')}</Text>
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
