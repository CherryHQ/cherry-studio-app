import CheckIcon from '@cherrystudio/app-icons/icons/check';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import SquarePenIcon from '@cherrystudio/app-icons/icons/square-pen';
import { BottomSheet, Button, ContentState, SearchField } from '@cherrystudio/ui/components';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { AgentSummary, ConversationSourceRef } from '@/frontend/appShell/conversation';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { CloudMark } from '@/frontend/components/CloudMark';
import { ManagedMark, useManagedLabel, withResourcePolicy } from '@/frontend/components/Policy';
import { agentPolicy } from '@/shared/data/managedPolicy';

export type AgentPickerItem = Omit<AgentSummary, 'ref'>;

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
  currentAgentSource?: ConversationSourceRef['kind'];
  catalog: AgentPickerCatalog;
  emptyState?: ReactNode;
  searchable?: boolean;
  onSelect(agentId: string, agent: AgentPickerItem): void;
  onEdit?(agentId: string): void;
  onCreate?(): void;
  onClose: () => void;
  open: boolean;
  testID?: string;
  title?: string;
};

export function AgentPickerSheet({
  currentAgentId,
  currentAgentSource,
  catalog,
  emptyState,
  searchable = false,
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
  const [query, setQuery] = useState('');
  const handleClose = () => {
    setQuery('');
    onClose();
  };
  const isSelected = (agent: AgentPickerItem) =>
    agent.id === currentAgentId &&
    (!currentAgentSource || (agent.source?.kind ?? 'local') === currentAgentSource);
  const selectAgent = (agent: AgentPickerItem) => {
    handleClose();
    if (!isSelected(agent)) onSelect(agent.id, agent);
  };
  const editAgent = onEdit
    ? (agentId: string) => {
        handleClose();
        onEdit(agentId);
      }
    : undefined;
  const normalizedQuery = searchable ? query.trim().toLowerCase() : '';
  const filteredAgents = useMemo(() => {
    if (!normalizedQuery) return agents;
    return agents.filter((agent) =>
      [agent.name, agent.modelName, agent.groupName].some((field) =>
        field?.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [agents, normalizedQuery]);

  return (
    <BottomSheet
      footer={
        onCreate ? (
          <Button
            icon={<PlusIcon className="size-5 text-foreground" />}
            onPress={() => {
              handleClose();
              onCreate();
            }}
            variant="secondary"
          >
            <Button.Label>{t('agent.actions.create')}</Button.Label>
          </Button>
        ) : undefined
      }
      onClose={handleClose}
      open={open}
      size="medium"
      testID={testID}
      title={title ?? t('agent.list.title')}
    >
      {searchable ? (
        <View className="px-4 pt-1 pb-2">
          <SearchField
            accessibilityLabel={t('navigation.search')}
            clearAccessibilityLabel={t('common.clear')}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            placeholder={t('navigation.search')}
            testID={`${testID}-search`}
            value={query}
          />
        </View>
      ) : null}
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
        ) : filteredAgents.length === 0 ? (
          <ContentState.Empty title={t('agent.list.noResults')} />
        ) : (
          <View className="gap-1">
            {[
              ...filteredAgents.filter((agent) => isSelected(agent)),
              ...filteredAgents.filter((agent) => !isSelected(agent)),
            ].map((agent) => (
              <AgentPickerRow
                agent={agent}
                key={
                  agent.source?.kind === 'team'
                    ? `team:${agent.source.bindingId}:${agent.id}`
                    : `${agent.source?.kind ?? 'default'}:${agent.id}`
                }
                onEdit={editAgent}
                onSelect={selectAgent}
                selected={isSelected(agent)}
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

function AgentPickerRowView({
  agent,
  onEdit,
  onSelect,
  selected,
}: {
  agent: AgentPickerItem;
  onEdit?: (agentId: string) => void;
  onSelect: (agent: AgentPickerItem) => void;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const baseAccessibilityLabel = useManagedLabel(agent.name);
  const isCloud = agent.source?.kind === 'team';
  const accessibilityLabel = isCloud
    ? `${baseAccessibilityLabel}, ${t('teamAgent.cloudExecution')}`
    : baseAccessibilityLabel;
  const subtitle =
    agent.modelName ??
    agent.groupName ??
    (agent.configuration !== 'unknown' ? t('agent.model.none') : undefined);

  return (
    <View className="min-w-0 flex-row items-center gap-2">
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        className="min-w-0 flex-1 flex-row items-center gap-3 rounded-xl py-1 active:opacity-60"
        onPress={() => onSelect(agent)}
      >
        <AgentAvatar
          avatar={agent.avatar}
          emoji={agent.emoji}
          name={agent.name}
          size={36}
          uri={agent.avatarUri}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="min-w-0 flex-row items-center gap-1.5">
            <Text
              className="min-w-0 shrink font-semibold text-base text-foreground"
              numberOfLines={1}
            >
              {agent.name}
            </Text>
            {isCloud ? <CloudMark /> : null}
            <ManagedMark />
          </View>
          {subtitle ? (
            <Text className="text-muted-foreground text-xs" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {selected ? <CheckIcon className="size-5 shrink-0 text-foreground" /> : null}
      </Pressable>
      {onEdit && !isCloud ? (
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

/** Each row follows its own Agent's policy. */
const AgentPickerRow = withResourcePolicy(AgentPickerRowView, ({ agent }) => agentPolicy(agent));
