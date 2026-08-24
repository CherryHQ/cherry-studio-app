import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  useAppSearch,
  type AppSearchFilterProps,
  type AppSearchOutcome,
} from '@/frontend/components/appSearch';
import { ModelAvatar } from '@/frontend/components/avatar';
import { useModels, useProviders } from '@/frontend/hooks/chat';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { ModelTypeFilterBar } from '../components/ModelTypeFilterBar';
import {
  buildModelPickerGroups,
  type ModelPickerGroup,
  type ModelPickerModelItem,
  type ModelPickerTag,
} from '../utils/modelPickerData';
import {
  getModelTypeCounts,
  matchesModelTypeFilter,
  type ModelTypeFilter,
} from '../utils/modelTypeFilter';
import { useModelPickerData } from './useModelPickerData';

const EMPTY_TAGS: readonly ModelPickerTag[] = Object.freeze([]);

type ModelSearchOptions = {
  initialTypeFilter?: ModelTypeFilter;
  providerId?: string;
  selectedModelId: string | null;
  selectedTags?: readonly ModelPickerTag[];
};

type ModelSearchFilterContext = {
  providerId?: string;
  selectedTags: readonly ModelPickerTag[];
};

type ModelSearchSource = {
  isLoading: boolean;
  models: readonly Model[];
  providers: readonly Provider[];
};

/** Domain adapter for every place that asks the app search page to return one model. */
export function useModelSearch() {
  const { t } = useTranslation();
  const { open } = useAppSearch();
  const { isLoading: isModelsLoading, models } = useModels({ enabled: true });
  const { isLoading: isProvidersLoading, providers } = useProviders({ enabled: true });
  const sourceRef = useRef<ModelSearchSource>({ isLoading: true, models: [], providers: [] });
  const readyListenersRef = useRef(new Set<() => void>());
  const isLoading = isModelsLoading || isProvidersLoading;

  useEffect(() => {
    sourceRef.current = { isLoading, models, providers };
    if (isLoading) {
      return;
    }

    for (const listener of readyListenersRef.current) {
      listener();
    }
    readyListenersRef.current.clear();
  }, [isLoading, models, providers]);

  return useCallback(
    async ({
      initialTypeFilter = 'all',
      providerId,
      selectedModelId,
      selectedTags = EMPTY_TAGS,
    }: ModelSearchOptions): Promise<AppSearchOutcome<ModelPickerModelItem>> =>
      open<ModelPickerModelItem, ModelTypeFilter, ModelSearchFilterContext>({
        emptyText: t('settings.provider.models.search.empty'),
        filter: {
          component: ModelSearchTypeFilter,
          context: { providerId, selectedTags },
          initialValue: initialTypeFilter,
        },
        getAccessibilityLabel: (item) => item.model.name,
        getAccessibilityState: (item) => ({ selected: item.modelId === selectedModelId }),
        keyExtractor: (item) => item.key,
        placeholder: t('modelPicker.searchPlaceholder'),
        renderItem: (item) => (
          <ModelSearchResult isSelected={item.modelId === selectedModelId} item={item} />
        ),
        search: async ({ filters, query, signal }) => {
          await waitForModelSearchSource(sourceRef, readyListenersRef, signal);
          const source = sourceRef.current;
          const scopedProviders = providerId
            ? source.providers.filter((provider) => provider.id === providerId)
            : source.providers;

          const groups = buildModelPickerGroups({
            models: source.models,
            providers: scopedProviders,
            searchText: query,
            selectedTags,
          });

          return { groups: filterGroupsByModelType(groups, filters) };
        },
      }),
    [open, t],
  );
}

function ModelSearchTypeFilter({
  context: { providerId, selectedTags },
  onChange,
  query,
  value,
}: AppSearchFilterProps<ModelTypeFilter, ModelSearchFilterContext>) {
  const { groups } = useModelPickerData({ providerId, searchText: query, selectedTags });
  const counts = getModelTypeCounts(
    groups.flatMap((group) => group.items.map((item) => item.model)),
  );

  return <ModelTypeFilterBar counts={counts} onSelect={onChange} selectedFilter={value} />;
}

function filterGroupsByModelType(
  groups: readonly ModelPickerGroup[],
  typeFilter: ModelTypeFilter,
): ModelPickerGroup[] {
  if (typeFilter === 'all') {
    return [...groups];
  }

  return groups.flatMap((group) => {
    const items = group.items.filter((item) => matchesModelTypeFilter(item.model, typeFilter));

    return items.length > 0 ? [{ ...group, items }] : [];
  });
}

function ModelSearchResult({
  isSelected,
  item,
}: {
  isSelected: boolean;
  item: ModelPickerModelItem;
}) {
  return (
    <View className="min-h-12 flex-row items-center gap-3">
      <ModelAvatar model={item.model} provider={item.provider} size={32} />
      <Text className="min-w-0 flex-1 text-base text-foreground" numberOfLines={2}>
        {item.model.name}
      </Text>
      {isSelected ? <CheckIcon className="size-5 shrink-0 text-success" /> : null}
    </View>
  );
}

function waitForModelSearchSource(
  sourceRef: { current: ModelSearchSource },
  listenersRef: { current: Set<() => void> },
  signal: AbortSignal,
) {
  if (!sourceRef.current.isLoading) {
    return Promise.resolve();
  }

  if (signal.aborted) {
    return Promise.reject(new Error('Model search was cancelled'));
  }

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      listenersRef.current.delete(handleReady);
      signal.removeEventListener('abort', handleAbort);
    };
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleAbort = () => {
      cleanup();
      reject(new Error('Model search was cancelled'));
    };

    listenersRef.current.add(handleReady);
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}
