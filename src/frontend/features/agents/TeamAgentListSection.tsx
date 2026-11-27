import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { ContentState } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTeamAgentState, useTeamDirectorySync } from '@/frontend/appShell/conversation/team';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { CloudMark } from '@/frontend/components/CloudMark';
import type { TeamAgent } from '@/shared/contracts/teamAgent';

// A 40pt avatar, its 12pt vertical padding, and the hairline separator.
const TEAM_AGENT_ROW_ESTIMATED_HEIGHT = 65;

type TeamAgentListSectionProps = {
  bottomInset: number;
  isFiltering: boolean;
  onSelectAgent: (agentId: string) => void;
  query: string;
};

type TeamAgentExtraData = {
  cloudLabel: string;
  lastId: string | undefined;
  onSelectAgent: (agentId: string) => void;
};

function teamAgentKeyExtractor(agent: TeamAgent) {
  return agent.id;
}

/** Readonly directory of enterprise Team Agents shown under the Agents tab when signed in. */
export function TeamAgentListSection({
  bottomInset,
  isFiltering,
  onSelectAgent,
  query,
}: TeamAgentListSectionProps) {
  const { t } = useTranslation();
  const { module, state } = useTeamAgentState();
  useTeamDirectorySync(module, state.context?.key);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredAgents = useMemo(() => {
    if (!normalizedQuery) return [...state.agents];
    return state.agents.filter((agent) =>
      [agent.name, agent.groupName, agent.description].some((field) =>
        field?.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [normalizedQuery, state.agents]);

  const listContentStyle = useMemo(
    () => ({ paddingBottom: bottomInset, paddingHorizontal: 16, paddingTop: 8 }),
    [bottomInset],
  );
  const listExtraData = useMemo<TeamAgentExtraData>(
    () => ({
      cloudLabel: t('teamAgent.cloudExecution'),
      lastId: filteredAgents.at(-1)?.id,
      onSelectAgent,
    }),
    [filteredAgents, onSelectAgent, t],
  );
  const renderItem = useCallback(
    ({ extraData, index, item }: LegendListRenderItemProps<TeamAgent>) => {
      const { cloudLabel, lastId, onSelectAgent: selectAgent } = extraData as TeamAgentExtraData;
      const isFirst = index === 0;
      const isLast = item.id === lastId;
      const subtitle = [
        item.groupName && item.groupName !== item.name ? item.groupName : undefined,
        item.description,
      ]
        .filter(Boolean)
        .join(' · ');

      return (
        <View className="mx-auto w-full max-w-[720px]">
          <View
            className={cn(
              'overflow-hidden bg-card',
              isFirst && 'rounded-t-2xl',
              isLast && 'rounded-b-2xl',
            )}
            style={styles.cardSlice}
          >
            {isFirst ? null : <View className="mx-4 h-px bg-border" />}
            <Pressable
              accessibilityLabel={`${item.name}, ${cloudLabel}`}
              accessibilityRole="button"
              className="w-full active:bg-foreground/5"
              onPress={() => selectAgent(item.id)}
              testID={`team-agent-list-${item.id}`}
            >
              <View className="min-w-0 flex-row items-center gap-3 px-4 py-3">
                <AgentAvatar name={item.name} />
                <View className="min-w-0 flex-1 gap-0.5">
                  <View className="min-w-0 flex-row items-center gap-1.5">
                    <Text className="min-w-0 shrink text-base text-foreground" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <CloudMark />
                  </View>
                  {subtitle ? (
                    <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
              </View>
            </Pressable>
          </View>
        </View>
      );
    },
    [],
  );

  const listEmpty =
    state.phase === 'loading' && !state.agents.length ? (
      <View className="px-8 py-16">
        <ContentState.Loading title={t('remoteAgent.loading')} />
      </View>
    ) : state.phase === 'error' && !state.agents.length ? (
      <View className="px-8 py-16">
        <ContentState.Error
          primaryAction={{
            children: t('common.retry'),
            onPress: () => void module.refresh().catch(() => {}),
          }}
          title={t('teamAgent.unavailable')}
        />
      </View>
    ) : isFiltering ? (
      <View className="px-8 py-16">
        <ContentState.Empty title={t('agent.list.noResults')} />
      </View>
    ) : (
      <View className="px-8 py-16">
        <ContentState.Empty title={t('teamAgent.noAgents')} />
      </View>
    );

  return (
    <LegendList
      alwaysBounceVertical={false}
      contentContainerStyle={listContentStyle}
      contentInsetAdjustmentBehavior="automatic"
      data={filteredAgents}
      estimatedItemSize={TEAM_AGENT_ROW_ESTIMATED_HEIGHT}
      extraData={listExtraData}
      keyExtractor={teamAgentKeyExtractor}
      ListEmptyComponent={listEmpty}
      maintainVisibleContentPosition={false}
      recycleItems
      renderItem={renderItem}
      showsVerticalScrollIndicator={false}
      style={styles.list}
      testID="team-agent-list"
    />
  );
}

const styles = StyleSheet.create({
  cardSlice: { borderCurve: 'continuous' },
  list: { flex: 1 },
});
