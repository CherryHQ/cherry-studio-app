import { SearchField } from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useInlineSearch } from '@/frontend/components/InlineSearch';
import {
  buildModelPickerListItems,
  ModelPickerList,
  type ModelPickerGroup,
} from '@/frontend/components/ModelPicker';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

/** Adapt onboarding candidates to the existing model picker without enabling unsaved previews. */
export function OnboardingModelList({
  children,
  disabled,
  models,
  onSelect,
  providers,
  selectedId,
}: {
  children?: ReactNode;
  disabled: boolean;
  models: Model[];
  onSelect: (model: Model) => void;
  providers: Provider[];
  selectedId?: string;
}) {
  const { t } = useTranslation();
  const { query, results, setQuery } = useInlineSearch({
    fields: (model: Model) => [
      model.name,
      model.modelId,
      providers.find((provider) => provider.id === model.providerId)?.name,
    ],
    items: models,
  });
  const groups = providers.flatMap<ModelPickerGroup>((provider) => {
    const items = results
      .filter((model) => model.providerId === provider.id)
      .map((model) => ({ key: model.id, model, modelId: model.id, provider }));
    return items.length > 0 ? [{ items, key: provider.id, provider, title: provider.name }] : [];
  });

  return (
    <View className="min-h-0 flex-1 gap-2" testID="onboarding-model-list">
      <View className="px-6">
        <SearchField
          accessibilityLabel={t('modelPicker.searchPlaceholder')}
          clearAccessibilityLabel={t('common.clear')}
          disabled={disabled}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          placeholder={t('modelPicker.searchPlaceholder')}
          testID="onboarding-model-search"
          value={query}
        />
      </View>
      {children ? <View className="px-6">{children}</View> : null}
      <ModelPickerList
        disabled={disabled}
        emptyText={t('onboarding.model.noResults')}
        isOpen
        listItems={buildModelPickerListItems(groups)}
        onSelect={(item) => onSelect(item.model)}
        selectedModelId={selectedId ?? null}
        showBadges
      />
    </View>
  );
}
