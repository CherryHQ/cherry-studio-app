import CheckIcon from '@cherrystudio/app-icons/icons/check';
import InfoIcon from '@cherrystudio/app-icons/icons/info';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import { BottomSheet, Button, ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { AgentAvatar } from '@/frontend/components/avatar';
import { chatRouteParams } from '@/frontend/components/navigation/chat';
import { useAgentsApi } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

type MainHeaderAgentPickerSheetProps = {
  currentAgentId?: string;
  onClose: () => void;
  open: boolean;
};

export function MainHeaderAgentPickerSheet({
  currentAgentId,
  onClose,
  open,
}: MainHeaderAgentPickerSheetProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { agents, error, isLoading, refetch } = useAgentsApi();

  const selectAgent = (agentId: string) => {
    onClose();
    router.setParams(chatRouteParams({ agentId, kind: 'draft' }));
  };
  const editAgent = (agentId: string) => {
    onClose();
    router.push({ params: { agentId }, pathname: '/agents/[agentId]/edit' });
  };
  const createAgent = () => {
    onClose();
    router.push('/agents/new');
  };

  return (
    <BottomSheet
      footer={
        <Button
          icon={<PlusIcon className="size-5 text-foreground" />}
          onPress={createAgent}
          variant="secondary"
        >
          <Button.Label>{t('agent.actions.create')}</Button.Label>
        </Button>
      }
      onClose={onClose}
      open={open}
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
        ) : error ? (
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
            {agents.map((agent) => (
              <AgentPickerRow
                agent={agent}
                key={agent.id}
                onEdit={editAgent}
                onSelect={selectAgent}
                selected={agent.id === currentAgentId}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function AgentPickerRow({
  agent,
  onEdit,
  onSelect,
  selected,
}: {
  agent: Agent;
  onEdit: (agentId: string) => void;
  onSelect: (agentId: string) => void;
  selected: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View className="min-w-0 flex-row items-center gap-2">
      <Pressable
        accessibilityLabel={agent.name}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        className="min-w-0 flex-1 flex-row items-center gap-3 rounded-xl py-1 active:opacity-60"
        onPress={() => onSelect(agent.id)}
      >
        <AgentAvatar name={agent.name} size={36} uri={agent.avatarUri} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-semibold text-base text-foreground">{agent.name}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {agent.modelName ?? t('agent.model.none')}
          </Text>
        </View>
        {selected ? <CheckIcon className="size-5 shrink-0 text-foreground" /> : null}
      </Pressable>
      <Pressable
        accessibilityLabel={`${t('common.edit')}: ${agent.name}`}
        accessibilityRole="button"
        className="size-10 items-center justify-center rounded-full active:bg-secondary"
        hitSlop={4}
        onPress={() => onEdit(agent.id)}
      >
        <InfoIcon className="size-5 text-muted-foreground" />
      </Pressable>
    </View>
  );
}
