import { BottomSheet } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppSearchButton } from '@/frontend/components/appSearch';

import { useModelPickerData } from '../hooks/useModelPickerData';
import { useModelSearch } from '../hooks/useModelSearch';
import { type ModelPickerModelItem, type ModelPickerTag } from '../utils/modelPickerData';
import { buildModelPickerListItems } from '../utils/modelPickerListItems';
import { ModelPickerList } from './ModelPickerList';

const DEFAULT_SELECTED_TAGS: readonly ModelPickerTag[] = [];

type ModelPickerDrawerProps = {
  onClose: () => void;
  onSelect: (item: ModelPickerModelItem) => void;
  open: boolean;
  providerId?: string;
  selectedTags?: readonly ModelPickerTag[];
  selectedModelId: string | null;
  title?: string;
};

/** The complete model-picking interaction; callers only supply business state and actions. */
export function ModelPickerDrawer({
  onClose,
  onSelect,
  open,
  providerId,
  selectedTags = DEFAULT_SELECTED_TAGS,
  selectedModelId,
  title,
}: ModelPickerDrawerProps) {
  const { t } = useTranslation();
  const openModelSearch = useModelSearch();
  const [isSearching, setIsSearching] = useState(false);
  const resolvedTitle = title ?? t('modelPicker.title');
  const isSheetOpen = open && !isSearching;
  const handleOpenSearch = useCallback(() => {
    if (isSearching) {
      return;
    }

    // Remove the sheet's portal and Android back handler before pushing the
    // root search route. Cancellation restores the same picker state.
    setIsSearching(true);
    requestAnimationFrame(() => {
      void openModelSearch({
        providerId,
        selectedModelId,
        selectedTags,
      }).then((outcome) => {
        setIsSearching(false);
        if (outcome.type === 'selected') {
          onSelect(outcome.item);
        }
      });
    });
  }, [isSearching, onSelect, openModelSearch, providerId, selectedModelId, selectedTags]);

  return (
    <BottomSheet
      headerAction={
        <AppSearchButton
          accessibilityLabel={t('navigation.search')}
          disabled={isSearching}
          onPress={handleOpenSearch}
        />
      }
      onClose={onClose}
      open={isSheetOpen}
      size="large"
      testID="model-picker"
      title={resolvedTitle}
    >
      <ModelPickerDrawerContent
        onSelect={onSelect}
        open={isSheetOpen}
        providerId={providerId}
        selectedModelId={selectedModelId}
        selectedTags={selectedTags}
      />
    </BottomSheet>
  );
}

function ModelPickerDrawerContent({
  onSelect,
  open,
  providerId,
  selectedTags,
  selectedModelId,
}: Pick<
  ModelPickerDrawerProps,
  'onSelect' | 'open' | 'providerId' | 'selectedModelId' | 'selectedTags'
>) {
  const { t } = useTranslation();
  const { groups, isLoading } = useModelPickerData({
    providerId,
    selectedTags,
  });
  const listItems = useMemo(() => buildModelPickerListItems(groups), [groups]);

  return (
    <ModelPickerList
      emptyText={t('modelPicker.empty')}
      isLoading={isLoading}
      isOpen={open}
      listItems={listItems}
      loadingText={t('settings.provider.models.loading')}
      onSelect={onSelect}
      selectedModelId={selectedModelId}
    />
  );
}
