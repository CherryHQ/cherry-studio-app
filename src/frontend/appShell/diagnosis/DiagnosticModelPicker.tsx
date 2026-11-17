import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { SearchField } from '@cherrystudio/ui/components';
import { useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  buildModelPickerListItems,
  ModelPickerList,
  useModelPickerData,
  type ModelPickerModelItem,
} from '@/frontend/components/ModelPicker';
import { ModelRegistryGate } from '@/frontend/components/ModelRegistry';

type DiagnosticModelPickerProps = {
  selectedModelId: string | null;
  onSelect: (model: ModelPickerModelItem) => void;
  onAddProvider: () => void;
  unavailableProviderId?: string;
  unavailableModelId?: string;
};

export function DiagnosticModelPicker(props: DiagnosticModelPickerProps) {
  return (
    <ModelRegistryGate>
      <DiagnosticModelList {...props} />
    </ModelRegistryGate>
  );
}

function DiagnosticModelList({
  selectedModelId,
  onSelect,
  onAddProvider,
  unavailableProviderId,
  unavailableModelId,
}: DiagnosticModelPickerProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const { groups, isLoading } = useModelPickerData({
    modelType: 'text',
    searchText: deferredSearch,
  });
  const listItems = useMemo(
    () =>
      buildModelPickerListItems(
        groups.flatMap((group) => {
          if (group.provider.id === unavailableProviderId) return [];
          const items = group.items.filter(
            (item) =>
              item.modelId !== unavailableModelId &&
              item.model.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL),
          );
          return items.length ? [{ ...group, items }] : [];
        }),
      ),
    [groups, unavailableModelId, unavailableProviderId],
  );

  return (
    <View className="min-h-0 flex-1 gap-4 px-4 pt-2">
      <View className="gap-3">
        <Text className="text-sm text-muted-foreground">{t('diagnosis.modelPurpose')}</Text>
        <SearchField
          accessibilityLabel={t('modelPicker.searchPlaceholder')}
          clearAccessibilityLabel={t('common.clear')}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          placeholder={t('modelPicker.searchPlaceholder')}
          value={search}
        />
      </View>
      <ModelPickerList
        contentInset="none"
        density="compact"
        emptyAction={
          deferredSearch.trim()
            ? undefined
            : { label: t('modelPicker.addProvider'), onPress: onAddProvider }
        }
        emptyText={t(deferredSearch.trim() ? 'modelPicker.empty' : 'diagnosis.noAnalysisModels')}
        isLoading={isLoading}
        isOpen
        listItems={listItems}
        onSelect={onSelect}
        selectedModelId={selectedModelId}
      />
    </View>
  );
}
