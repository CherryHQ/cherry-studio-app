import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { BottomSheet, Button, ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { AgentSummary, useConversationAgents } from '@/frontend/appShell/conversation';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { ManagedMark, useManagedLabel, withResourcePolicy } from '@/frontend/components/Policy';
import { agentPolicy } from '@/shared/data/managedPolicy';

type MainHeaderAgentPickerSheetProps = {
  currentAgentId?: string;
  catalog: ReturnType<typeof useConversationAgents>;
  onSelect(agentId: string): void;
  onClose: () => void;
  open: boolean;
  presentation?: 'default' | 'overlay';
};

export function MainHeaderAgentPickerSheet({
  currentAgentId,
  catalog,
  onSelect,
  onClose,
  open,
  presentation,
}: MainHeaderAgentPickerSheetProps) {
  const { t } = useTranslation();
  const { items: agents, isError, isLoading, refetch } = catalog;
  const selectAgent = (agentId: string) => {
    onClose();
    if (agentId !== currentAgentId) onSelect(agentId);
  };

  return (
    <BottomSheet
      onClose={onClose}
      open={open}
      presentation={presentation}
      size="medium"
      testID="main-header-agent-picker"
      title={t('agent.list.title')}
    >
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="px-4 pt-2 pb-4"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ContentState.Loading title={t('agent.list.loading')} />
        ) : isError ? (
          <ContentState.Error
            primaryAction={{
              children: t('agent.actions.retry'),
              onPress: () => void refetch(),
            }}
            title={t('agent.list.loadFailed')}
          />
        ) : agents.length === 0 ? (
          <ContentState.Empty
            description={t('agent.list.emptyDescription')}
            title={t('agent.list.emptyTitle')}
          />
        ) : (
          <View className="gap-1">
            {[
              ...agents.filter((agent) => agent.id === currentAgentId),
              ...agents.filter((agent) => agent.id !== currentAgentId),
            ].map((agent) => (
              <AgentPickerRow
                agent={agent}
                key={agent.id}
                onSelect={selectAgent}
                selected={agent.id === currentAgentId}
              />
            ))}
          </View>
        )}
        {catalog.hasNextPage ? (
          <Button
            variant="ghost"
            loading={catalog.isFetchingNextPage}
            onPress={() => void catalog.fetchNextPage()}
          >
            {t('remoteAgent.loadMore')}
          </Button>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

function AgentPickerRowView({
  agent,
  onSelect,
  selected,
}: {
  agent: AgentSummary;
  onSelect: (agentId: string) => void;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const accessibilityLabel = useManagedLabel(agent.name);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className="min-w-0 flex-row items-center gap-3 rounded-xl py-1 active:opacity-60"
      onPress={() => onSelect(agent.id)}
    >
      <AgentAvatar
        avatar={agent.avatar}
        emoji={agent.emoji}
        name={agent.name}
        size={36}
        uri={agent.avatarUri}
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="min-w-0 flex-row items-center gap-2">
          <Text className="shrink font-semibold text-base text-foreground">{agent.name}</Text>
          <ManagedMark />
        </View>
        {agent.modelName || agent.configuration !== 'unknown' ? (
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {agent.modelName ?? t('agent.model.none')}
          </Text>
        ) : null}
      </View>
      {selected ? <CheckIcon className="size-5 shrink-0 text-foreground" /> : null}
    </Pressable>
  );
}

/** Each row follows its own Agent's policy. */
const AgentPickerRow = withResourcePolicy(AgentPickerRowView, ({ agent }) => agentPolicy(agent));
