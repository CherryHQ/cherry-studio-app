import { Button, ContentState } from '@cherrystudio/ui/components';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AgentRef } from '@/frontend/appShell/conversation';
import { useRemoteModels } from '@/frontend/appShell/conversation/remote';
import { EmptyIllustration } from '@/frontend/components/EmptyIllustration';
import {
  ModelPickerList,
  ModelPickerSearch,
  ModelPickerSheet,
  type ModelPickerChoiceListItem,
} from '@/frontend/components/ModelPicker';
import type { RemoteModelOption, RemoteModelSelection } from '@/shared/contracts/remoteAgent';

const FOLLOW_DEFAULT_KEY = 'default';
const choiceKey = ({ providerId, modelId }: RemoteModelSelection) =>
  JSON.stringify([providerId, modelId]);

export function RemoteModelPicker({
  agent,
  open,
  defaultModelName,
  defaultModelIdentity,
  selected,
  confirmLabel,
  onSelect,
  onClose,
}: {
  agent: AgentRef;
  open: boolean;
  defaultModelName?: string | null;
  defaultModelIdentity?: RemoteModelSelection;
  selected?: RemoteModelSelection;
  confirmLabel?: string;
  onSelect(model?: RemoteModelOption): void;
  onClose(): void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [replacement, setReplacement] = useState<RemoteModelOption>();
  const query = useDeferredValue(search.trim());
  const models = useRemoteModels(agent, query, open);
  const pages = models.data?.pages;
  const { options, rows } = useMemo(() => {
    const options = new Map<string, RemoteModelOption>();
    const groups = new Map<string, RemoteModelOption[]>();
    for (const page of pages ?? []) {
      for (const option of page.items) {
        const key = choiceKey(option);
        if (options.has(key)) continue;
        options.set(key, option);
        const group = groups.get(option.providerId);
        if (group) group.push(option);
        else groups.set(option.providerId, [option]);
      }
    }
    const rows: ModelPickerChoiceListItem[] = [];
    if (!query)
      rows.push({
        type: 'choice',
        key: FOLLOW_DEFAULT_KEY,
        name: t('remoteAgent.followAgentModel'),
        description: defaultModelName ?? undefined,
        model:
          defaultModelIdentity && defaultModelName
            ? { ...defaultModelIdentity, name: defaultModelName }
            : undefined,
      });
    for (const [providerId, items] of groups) {
      const title = items[0]!.providerName;
      rows.push({
        type: 'groupHeader',
        key: 'header:' + providerId,
        title,
        isFirstGroup: rows.length === 0,
        provider: { id: providerId, name: title, builtinOnly: true },
      });
      for (const model of items)
        rows.push({
          type: 'choice',
          key: choiceKey(model),
          name: model.name,
          description: model.name === model.modelId ? undefined : model.modelId,
          model,
        });
    }
    return { options, rows };
  }, [defaultModelIdentity, defaultModelName, pages, query, t]);
  const choice = confirmLabel ? replacement : selected;
  const choose = (key: string) => {
    const option = options.get(key);
    if (!option && key !== FOLLOW_DEFAULT_KEY) return;
    if (confirmLabel) setReplacement(option);
    else onSelect(option);
  };
  const reset = useCallback(() => {
    setSearch('');
    setReplacement(undefined);
  }, []);
  const retry = models.isFetchNextPageError ? models.fetchNextPage : models.refetch;
  const error = models.isError ? (
    <ContentState.Error
      title={t('remoteAgent.loadFailed')}
      primaryAction={{ children: t('common.retry'), onPress: () => void retry() }}
    />
  ) : null;
  const loadingText = t('settings.provider.models.loading');
  const emptyText = query ? t('settings.provider.models.search.empty') : t('modelPicker.empty');
  const emptyIcon = <EmptyIllustration scene={query ? 'search' : 'connection'} size="panel" />;
  const loadMore = () => {
    if (open && models.isEnabled && models.hasNextPage && !models.isFetching && !models.isError)
      void models.fetchNextPage({ cancelRefetch: false });
  };
  return (
    <ModelPickerSheet
      open={open}
      onClose={onClose}
      onReset={reset}
      title={t('modelPicker.title')}
      footer={
        confirmLabel ? (
          <Button onPress={() => onSelect(replacement)}>{confirmLabel}</Button>
        ) : undefined
      }
    >
      {({ expand }) => (
        <View className="min-h-0 flex-1">
          <ModelPickerSearch
            value={search}
            onChange={(value) => setSearch(value.slice(0, 256))}
            onFocus={expand}
          />
          {error && !rows.length ? (
            <View className="flex-1 justify-center px-6 py-8">{error}</View>
          ) : (
            <ModelPickerList
              listItems={rows}
              selectedModelId={choice ? choiceKey(choice) : FOLLOW_DEFAULT_KEY}
              onChoose={choose}
              onEndReached={loadMore}
              bottomInset={bottom}
              isOpen={open}
              isLoading={models.isLoading}
              loadingText={loadingText}
              emptyText={emptyText}
              emptyIcon={emptyIcon}
              emptyAction={
                query
                  ? {
                      label: t('modelPicker.clearConditions'),
                      onPress: () => setSearch(''),
                      variant: 'text',
                    }
                  : undefined
              }
              footer={
                error ??
                (models.isLoading || models.isFetchingNextPage ? (
                  <ContentState.Loading />
                ) : models.isSuccess && !options.size && !query ? (
                  <ContentState.Empty title={emptyText} icon={emptyIcon} />
                ) : undefined)
              }
            />
          )}
        </View>
      )}
    </ModelPickerSheet>
  );
}
