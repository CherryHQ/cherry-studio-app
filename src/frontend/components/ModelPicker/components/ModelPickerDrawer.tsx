import EyeIcon from '@cherrystudio/app-icons/icons/eye';
import GiftIcon from '@cherrystudio/app-icons/icons/gift';
import {
  ActionMenu,
  BottomSheet,
  type BottomSheetSize,
  type BottomSheetSizes,
  Button,
  SearchField,
} from '@cherrystudio/ui/components';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View } from 'react-native';

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
import { ModelPickerFilterIcon } from './ModelPickerFilterIcon';
import { ModelPickerList } from './ModelPickerList';

export type ModelPickerDrawerVariant = 'default' | 'chat';

const modelPickerSizes = ['large', 'full'] as const satisfies BottomSheetSizes;

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
  /**
   * Offers a multi-select mode behind a header button. While enabled, a row tap
   * toggles the model through `onSelect`; the choice applies as it changes, so the sheet
   * needs no confirm step.
   */
  multiSelect?: ModelPickerMultiSelect;
  title?: string;
  variant?: ModelPickerDrawerVariant;
};

export type ModelPickerMultiSelect = {
  enabled: boolean;
  /** Leaving the mode returns to the caller's default choice. */
  onEnabledChange: (enabled: boolean) => void;
  /** In pick order. */
  selectedModelIds: readonly string[];
  maxCount: number;
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
  multiSelect,
  title,
  variant = 'default',
}: ModelPickerDrawerProps) {
  const { t } = useTranslation();
  const [sheetSize, setSheetSize] = useState<BottomSheetSize>('large');
  const [searchText, setSearchText] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<ModelPickerBadge | null>(null);
  const deferredSearchText = useDeferredValue(searchText);
  const handleSearchFocus = useCallback(() => setSheetSize('full'), []);
  const handleClose = useCallback(() => {
    setSheetSize('large');
    setSearchText('');
    setSelectedBadge(null);
    onClose();
  }, [onClose]);

  return (
    <BottomSheet
      avoidKeyboard
      headerAction={
        // A mode entered and left like selecting photos, not a setting the sheet keeps.
        multiSelect ? (
          <Button
            onPress={() => multiSelect.onEnabledChange(!multiSelect.enabled)}
            size="sm"
            testID="model-picker-multi-select"
            variant="ghost"
          >
            <Button.Label>
              {t(
                multiSelect.enabled
                  ? 'modelPicker.multiSelect.exit'
                  : 'modelPicker.multiSelect.label',
              )}
            </Button.Label>
          </Button>
        ) : undefined
      }
      onClose={handleClose}
      onSizeChange={setSheetSize}
      open={open}
      size={sheetSize}
      sizes={modelPickerSizes}
      testID="model-picker"
      title={
        multiSelect?.enabled
          ? t('modelPicker.multiSelect.title', {
              max: multiSelect.maxCount,
              selected: multiSelect.selectedModelIds.length,
            })
          : (title ?? t('modelPicker.title'))
      }
    >
      <ModelRegistryGate>
        <ModelPickerDrawerContent
          deferredSearchText={deferredSearchText}
          emptyText={emptyText}
          isModelVisible={isModelVisible}
          modelType={modelType}
          onAddProvider={onAddProvider}
          onSelect={onSelect}
          onSearchFocus={handleSearchFocus}
          onSearchTextChange={setSearchText}
          open={open}
          providerId={providerId}
          searchText={searchText}
          multiSelect={multiSelect?.enabled ? multiSelect : undefined}
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
  onSearchFocus,
  onSearchTextChange,
  open,
  providerId,
  searchText,
  selectedModelId,
  multiSelect,
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
  | 'multiSelect'
  | 'variant'
> & {
  deferredSearchText: string;
  onSearchFocus: () => void;
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
    hasSearch || hasActiveFilters
      ? {
          label: t('modelPicker.clearConditions'),
          onPress: () => {
            onSearchTextChange('');
            setSelectedBadge(null);
          },
          variant: 'text' as const,
        }
      : onAddProvider
        ? { label: t('modelPicker.addProvider'), onPress: onAddProvider }
        : undefined;
  const filterIcon =
    selectedBadge === 'vision' ? (
      <EyeIcon className="text-tag-blue-foreground" />
    ) : selectedBadge === 'free' ? (
      <GiftIcon className="text-tag-green-foreground" />
    ) : (
      <ModelPickerFilterIcon />
    );

  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-2 px-5 pb-2">
        <View className="min-w-0 flex-1">
          <SearchField
            accessibilityLabel={t('modelPicker.searchPlaceholder')}
            clearAccessibilityLabel={t('common.clear')}
            onChangeText={onSearchTextChange}
            onClear={() => onSearchTextChange('')}
            onFocus={onSearchFocus}
            onSubmitEditing={Keyboard.dismiss}
            placeholder={t('modelPicker.searchPlaceholder')}
            testID="model-picker-search"
            value={searchText}
            variant="subtle"
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
              accessibilityState={{ selected: hasActiveFilters }}
              accessibilityValue={
                selectedBadge ? { text: t(modelPickerBadgeLabelKeys[selectedBadge]) } : undefined
              }
              icon={filterIcon}
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
            hasSearch || hasActiveFilters
              ? t('settings.provider.models.search.empty')
              : (emptyText ?? t('modelPicker.empty'))
          }
          isLoading={isLoading}
          isOpen={open}
          listItems={listItems}
          loadingText={t('settings.provider.models.loading')}
          onSelect={onSelect}
          maxSelectedCount={multiSelect?.maxCount}
          selectedModelIds={multiSelect?.selectedModelIds}
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
