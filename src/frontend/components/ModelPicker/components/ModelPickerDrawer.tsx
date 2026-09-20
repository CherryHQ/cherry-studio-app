import ListFilterIcon from '@cherrystudio/app-icons/icons/list-filter';
import { ActionMenu, BottomSheet, Button, SearchField } from '@cherrystudio/ui/components';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ModelRegistryGate } from '@/frontend/components/ModelRegistry';

import { useModelPickerData } from '../hooks/useModelPickerData';
import {
  MODEL_PICKER_BADGES,
  matchesModelPickerBadges,
  type ModelPickerBadge,
} from '../utils/modelPickerBadges';
import type { ModelPickerModelItem } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import type { ModelTypeFilter } from '../utils/modelTypeFilter';
import { ModelPickerList } from './ModelPickerList';

export type ModelPickerDrawerVariant = 'default' | 'chat';

type ModelPickerDrawerProps = {
  emptyText?: string;
  isModelVisible?: (item: ModelPickerModelItem) => boolean;
  modelType: ModelTypeFilter;
  onAddProvider?: () => void;
  onClose: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  open: boolean;
  providerId?: string;
  selectedModelId: string | null;
  title?: string;
  variant?: ModelPickerDrawerVariant;
};

/** The complete model-picking interaction; callers only supply business state and actions. */
export function ModelPickerDrawer({
  emptyText,
  isModelVisible,
  modelType,
  onAddProvider,
  onClose,
  onSelect,
  open,
  providerId,
  selectedModelId,
  title,
  variant = 'default',
}: ModelPickerDrawerProps) {
  const { t } = useTranslation();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<ModelPickerBadge | null>(null);
  const deferredSearchText = useDeferredValue(searchText);
  const isSearchExpanded = isSearchFocused || searchText.trim().length > 0;
  const handleClose = useCallback(() => {
    setIsSearchFocused(false);
    setSearchText('');
    setSelectedBadge(null);
    onClose();
  }, [onClose]);

  return (
    <BottomSheet
      onClose={handleClose}
      open={open}
      size={isSearchExpanded ? 'full' : 'large'}
      testID="model-picker"
      title={title ?? t('modelPicker.title')}
    >
      <ModelRegistryGate>
        <ModelPickerDrawerContent
          deferredSearchText={deferredSearchText}
          emptyText={emptyText}
          isModelVisible={isModelVisible}
          modelType={modelType}
          onAddProvider={onAddProvider}
          onSelect={onSelect}
          onSearchFocusChange={setIsSearchFocused}
          onSearchTextChange={setSearchText}
          open={open}
          providerId={providerId}
          searchText={searchText}
          selectedModelId={selectedModelId}
          selectedBadge={selectedBadge}
          setSelectedBadge={setSelectedBadge}
          variant={variant}
        />
      </ModelRegistryGate>
    </BottomSheet>
  );
}

function ModelPickerDrawerContent({
  deferredSearchText,
  emptyText,
  isModelVisible,
  modelType,
  onAddProvider,
  onSelect,
  onSearchFocusChange,
  onSearchTextChange,
  open,
  providerId,
  searchText,
  selectedModelId,
  selectedBadge,
  setSelectedBadge,
  variant,
}: Pick<
  ModelPickerDrawerProps,
  | 'isModelVisible'
  | 'emptyText'
  | 'modelType'
  | 'onAddProvider'
  | 'onSelect'
  | 'open'
  | 'providerId'
  | 'selectedModelId'
  | 'variant'
> & {
  deferredSearchText: string;
  onSearchFocusChange: (isFocused: boolean) => void;
  onSearchTextChange: (value: string) => void;
  searchText: string;
  selectedBadge: ModelPickerBadge | null;
  setSelectedBadge: (badge: ModelPickerBadge | null) => void;
}) {
  const { t } = useTranslation();
  const { groups, isLoading } = useModelPickerData({
    modelType,
    providerId,
    searchText: deferredSearchText,
  });
  const filteredGroups = useMemo(
    () =>
      selectedBadge === null
        ? groups
        : groups.flatMap((group) => {
            const items = group.items.filter((item) =>
              matchesModelPickerBadges(item.model, [selectedBadge]),
            );
            return items.length > 0 ? [{ ...group, items }] : [];
          }),
    [groups, selectedBadge],
  );
  const visibleGroups = useMemo(
    () =>
      isModelVisible
        ? filteredGroups.flatMap((group) => {
            const items = group.items.filter(isModelVisible);
            return items.length > 0 ? [{ ...group, items }] : [];
          })
        : filteredGroups,
    [filteredGroups, isModelVisible],
  );
  const listItems = useMemo(() => buildModelPickerListItems(visibleGroups), [visibleGroups]);
  const hasSearch = deferredSearchText.trim().length > 0;
  const hasActiveFilters = selectedBadge !== null;
  const emptyAction =
    !hasSearch && !hasActiveFilters && onAddProvider
      ? { label: t('modelPicker.addProvider'), onPress: onAddProvider }
      : undefined;

  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-2 px-5 pb-2">
        <View className="min-w-0 flex-1">
          <SearchField
            accessibilityLabel={t('modelPicker.searchPlaceholder')}
            clearAccessibilityLabel={t('common.clear')}
            onBlur={() => onSearchFocusChange(false)}
            onChangeText={onSearchTextChange}
            onClear={() => onSearchTextChange('')}
            onFocus={() => onSearchFocusChange(true)}
            placeholder={t('modelPicker.searchPlaceholder')}
            testID="model-picker-search"
            value={searchText}
          />
        </View>
        {variant === 'chat' ? (
          <ActionMenu
            items={[
              {
                checked: selectedBadge === null,
                id: 'all',
                label: t('settings.provider.models.purpose.all'),
                onPress: () => setSelectedBadge(null),
              },
              ...MODEL_PICKER_BADGES.map((badge) => ({
                checked: selectedBadge === badge,
                id: badge,
                label: t(modelPickerBadgeLabelKeys[badge]),
                onPress: () => setSelectedBadge(badge),
              })),
            ]}
          >
            <Button
              accessibilityLabel={t('common.filter')}
              icon={<ListFilterIcon />}
              size="sm"
              testID="model-picker-filter"
              variant="ghost"
            />
          </ActionMenu>
        ) : null}
      </View>
      <View className="min-h-0 flex-1">
        <ModelPickerList
          emptyAction={emptyAction}
          emptyText={
            hasSearch
              ? t('settings.provider.models.search.empty')
              : (emptyText ?? t('modelPicker.empty'))
          }
          isLoading={isLoading}
          isOpen={open}
          listItems={listItems}
          loadingText={t('settings.provider.models.loading')}
          onSelect={onSelect}
          selectedModelId={selectedModelId}
          showBadges={variant === 'chat'}
        />
      </View>
    </View>
  );
}

const modelPickerBadgeLabelKeys = {
  free: 'models.capability.free',
  vision: 'models.capability.imageRecognition',
} as const satisfies Record<ModelPickerBadge, string>;
