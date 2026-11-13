import CheckIcon from '@cherrystudio/app-icons/icons/check';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import SquarePenIcon from '@cherrystudio/app-icons/icons/square-pen';
import { BottomSheet, Button, ContentState } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { AgentSummary } from '@/frontend/appShell/conversation';
import { AgentAvatar } from '@/frontend/components/Avatar';

type AgentPickerItem = Omit<AgentSummary, 'ref'>;

type AgentPickerCatalog = {
  items: readonly AgentPickerItem[];
  isError: boolean;
  isLoading: boolean;
  refetch: () => unknown;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage?: () => unknown;
};

export type AgentPickerSheetProps = {
  currentAgentId?: string;
  catalog: AgentPickerCatalog;
  emptyState?: ReactNode;
  onSelect(agentId: string): void;
  onEdit?(agentId: string): void;
  onCreate?(): void;
  onClose: () => void;
  open: boolean;
  testID?: string;
  title?: string;
};

export function AgentPickerSheet({
  currentAgentId,
  catalog,
  emptyState,
  onSelect,
  onEdit,
  onCreate,
  onClose,
  open,
  testID = 'agent-picker',
  title,
}: AgentPickerSheetProps) {
  const { t } = useTranslation();
  const { items: agents, isError, isLoading, refetch } = catalog;
  const selectAgent = (agentId: string) => {
    onClose();
    onSelect(agentId);
  };
  const editAgent = onEdit
    ? (agentId: string) => {
        onClose();
        onEdit(agentId);
      }
    : undefined;

  return (
    <BottomSheet
      footer={
        onCreate ? (
          <Button
            icon={<PlusIcon className="size-5 text-foreground" />}
            onPress={() => {
              onClose();
              onCreate();
            }}
            variant="secondary"
          >
            <Button.Label>{t('agent.actions.create')}</Button.Label>
          </Button>
        ) : undefined
      }
      onClose={onClose}
      open={open}
      size="medium"
      testID={testID}
      title={title ?? t('agent.list.title')}
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
          (emptyState ?? (
            <ContentState.Empty
              description={t('agent.list.emptyDescription')}
              title={t('agent.list.emptyTitle')}
            />
          ))
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
        {catalog.hasNextPage && catalog.fetchNextPage ? (
          <Button
            variant="ghost"
            loading={catalog.isFetchingNextPage}
            onPress={() => void catalog.fetchNextPage?.()}
          >
            {t('remoteAgent.loadMore')}
          </Button>
        ) : null}
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
  agent: AgentPickerItem;
  onEdit?: (agentId: string) => void;
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
        <AgentAvatar
          avatar={agent.avatar}
          emoji={agent.emoji}
          name={agent.name}
          size={36}
          uri={agent.avatarUri}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-semibold text-base text-foreground">{agent.name}</Text>
          {agent.modelName || agent.configuration !== 'unknown' ? (
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {agent.modelName ?? t('agent.model.none')}
            </Text>
          ) : null}
        </View>
        {selected ? <CheckIcon className="size-5 shrink-0 text-foreground" /> : null}
      </Pressable>
      {onEdit ? (
        <Pressable
          accessibilityLabel={`${t('common.edit')}: ${agent.name}`}
          accessibilityRole="button"
          className="size-10 items-center justify-center rounded-full active:bg-secondary"
          hitSlop={4}
          onPress={() => onEdit(agent.id)}
        >
          <SquarePenIcon className="size-5 text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
