import {
  BottomSheet,
  Button,
  ContentState,
  SearchField,
  Section,
} from '@cherrystudio/ui/components';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import type { AgentRef } from '@/frontend/appShell/conversation';
import { useRemoteModels } from '@/frontend/appShell/conversation/remote';
import type { RemoteModelOption } from '@/shared/contracts/remoteAgent';

export function RemoteModelPicker({
  agent,
  defaultModelName,
  selected,
  confirmLabel,
  onSelect,
  onClose,
}: {
  agent: AgentRef;
  defaultModelName?: string | null;
  selected?: RemoteModelOption;
  confirmLabel?: string;
  onSelect(model?: RemoteModelOption): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [choice, setChoice] = useState(selected);
  const choose = confirmLabel ? setChoice : onSelect;
  const query = useDeferredValue(search.trim());
  const models = useRemoteModels(agent, query);
  const groups = new Map<string, RemoteModelOption[]>();
  for (const model of models.items) {
    const group = groups.get(model.providerId);
    if (group) group.push(model);
    else groups.set(model.providerId, [model]);
  }
  return (
    <BottomSheet
      open
      avoidKeyboard
      onClose={onClose}
      title={t('modelPicker.title')}
      size="large"
      footer={confirmLabel && <Button onPress={() => onSelect(choice)}>{confirmLabel}</Button>}
    >
      <View className="px-5 pb-2">
        <SearchField
          accessibilityLabel={t('modelPicker.searchPlaceholder')}
          clearAccessibilityLabel={t('common.clear')}
          onChangeText={(value) => setSearch(value.slice(0, 256))}
          onClear={() => setSearch('')}
          placeholder={t('modelPicker.searchPlaceholder')}
          value={search}
          variant="subtle"
        />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-3 px-4 pb-4">
        {!query && (
          <Section>
            <Section.RadioItem
              label={t('remoteAgent.followAgentModel')}
              description={defaultModelName}
              selected={!choice}
              onPress={() => choose(undefined)}
            />
          </Section>
        )}
        {Array.from(groups, ([providerId, items]) => (
          <Section key={providerId} title={items[0]?.providerName}>
            {items.map((model) => (
              <Section.RadioItem
                key={model.modelId}
                label={model.name}
                description={model.name === model.modelId ? undefined : model.modelId}
                selected={
                  choice?.providerId === model.providerId && choice.modelId === model.modelId
                }
                onPress={() => choose(model)}
              />
            ))}
          </Section>
        ))}
        {models.isLoading && <ContentState.Loading />}
        {models.isSuccess && !models.items.length && (
          <ContentState.Empty title={t('modelPicker.empty')} />
        )}
        {models.isError && (
          <ContentState.Error
            title={t('remoteAgent.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void models.refetch() }}
          />
        )}
        {models.hasNextPage && (
          <Button
            variant="ghost"
            loading={models.isFetchingNextPage}
            onPress={() => void models.fetchNextPage()}
          >
            {t('remoteAgent.loadMore')}
          </Button>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
