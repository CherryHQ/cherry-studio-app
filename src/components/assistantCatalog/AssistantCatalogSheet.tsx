import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Chip } from 'heroui-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  SelectionBottomSheet,
  type SelectionBottomSheetRenderContext,
  SelectionSheetSearchField,
} from '@/components/selectionSheet';
import type { AssistantCatalogPreset } from '@/data/presets/assistantCatalogService';
import { getPresetKey } from '@/data/presets/assistantCatalogService';
import { useAssistantCatalog } from '@/hooks/chat/useAssistantCatalog';

type Props = {
  isOpen: boolean;
  onAddPreset: (preset: AssistantCatalogPreset) => Promise<void>;
  onClose: () => void;
};

const SHEET_CLOSED_INDEX = 0;
const SHEET_OPEN_INDEX = 1;

export function AssistantCatalogSheet({ isOpen, onAddPreset, onClose }: Props) {
  const { t } = useTranslation();
  const { isLoading, getTabs, filterPresets } = useAssistantCatalog({ enabled: isOpen });
  const [sheetIndex, setSheetIndex] = useState(SHEET_CLOSED_INDEX);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [activeTab, setActiveTab] = useState('__all__');
  const [search, setSearch] = useState('');
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setSheetIndex(isOpen ? SHEET_OPEN_INDEX : SHEET_CLOSED_INDEX);
  }

  const allLabel = t('common.all');
  const tabs = useMemo(() => getTabs(allLabel), [getTabs, allLabel]);
  const visiblePresets = useMemo(
    () => filterPresets(activeTab, search),
    [filterPresets, activeTab, search],
  );

  const handleSheetSettle = useCallback(
    (index: number) => {
      if (index === 0) {
        setSearch('');
        setActiveTab('__all__');
        onClose();
      }
    },
    [onClose],
  );

  const handleAdd = useCallback(
    async (preset: AssistantCatalogPreset) => {
      const key = getPresetKey(preset);
      if (addingIds.has(key)) return;
      setAddingIds((prev) => new Set(prev).add(key));
      try {
        await onAddPreset(preset);
      } catch {
        // ponytail: silent failure — parent should surface toast on error
      } finally {
        setAddingIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [addingIds, onAddPreset],
  );

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AssistantCatalogPreset>) => (
      <PresetRow preset={item} isAdding={addingIds.has(getPresetKey(item))} onAdd={handleAdd} />
    ),
    [addingIds, handleAdd],
  );

  return (
    <SelectionBottomSheet
      index={sheetIndex}
      onIndexChange={setSheetIndex}
      onSettle={handleSheetSettle}
    >
      {(_ctx: SelectionBottomSheetRenderContext) => (
        <View className="flex-1 px-4 pt-2">
          {/* Title */}
          <Text className="mb-3 text-center font-semibold text-foreground text-lg">
            {t('library.assistant_catalog.title')}
          </Text>

          {/* Search */}
          <SelectionSheetSearchField value={search} onChange={setSearch} />

          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
          >
            {tabs.map((tab) => (
              <Chip
                key={tab.id}
                size="md"
                variant={activeTab === tab.id ? 'primary' : 'soft'}
                onPress={() => setActiveTab(tab.id)}
              >
                <Chip.Label>{`${tab.label} (${tab.count})`}</Chip.Label>
              </Chip>
            ))}
          </ScrollView>

          {/* Preset list / loading / empty */}
          {isLoading ? (
            <View className="flex-1 items-center justify-center py-8">
              <Text className="text-default-foreground">{t('common.loading')}</Text>
            </View>
          ) : visiblePresets.length === 0 ? (
            <View className="flex-1 items-center justify-center py-8">
              <Text className="text-default-foreground">
                {search ? t('common.noResults') : t('assistant.catalog.empty')}
              </Text>
            </View>
          ) : (
            <LegendList
              data={visiblePresets}
              estimatedItemSize={72}
              keyExtractor={(item) => item.id}
              recycleItems
              renderItem={renderItem}
              className="flex-1"
              contentContainerStyle={{ paddingBottom: 24 }}
            />
          )}
        </View>
      )}
    </SelectionBottomSheet>
  );
}

function PresetRow({
  preset,
  isAdding,
  onAdd,
}: {
  preset: AssistantCatalogPreset;
  isAdding: boolean;
  onAdd: (preset: AssistantCatalogPreset) => void;
}) {
  const { t } = useTranslation();
  const summary = (preset.description || preset.prompt || '').replace(/\s+/g, ' ').trim();

  return (
    <Pressable
      className="mb-2 flex-row items-center gap-3 rounded-2xl border-continuous bg-settings-grouped-surface px-4 py-3 active:opacity-70"
      onPress={() => onAdd(preset)}
    >
      <View className="size-10 items-center justify-center rounded-full bg-surface-secondary">
        <Text className="text-xl">{preset.emoji || '🤖'}</Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
          {preset.name}
        </Text>
        {summary ? (
          <Text className="text-default-foreground text-xs" numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
      </View>
      <View className="rounded-lg bg-foreground/10 px-3 py-1.5">
        <Text className="text-xs font-semibold text-foreground">
          {isAdding ? t('common.adding') : t('common.add')}
        </Text>
      </View>
    </Pressable>
  );
}
