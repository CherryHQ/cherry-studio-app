import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { Button } from 'heroui-native/button';
import { Chip, Spinner } from 'heroui-native';
import { Dialog } from 'heroui-native/dialog';
import { useToast } from 'heroui-native/toast';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BackHeader } from '@/components/headers';
import { SelectionSheetSearchField } from '@/components/selectionSheet';
import type { AssistantCatalogPreset } from '@/data/presets/assistantCatalogService';
import { toCreateAssistantDtoFromCatalogPreset } from '@/data/presets/assistantCatalogService';
import { useAssistantMutations } from '@/hooks/chat';
import { useAssistantCatalog } from '@/hooks/chat/useAssistantCatalog';
export default function AssistantCatalogScreen() {
  const { t } = useTranslation();
  const { getTabs, filterPresets } = useAssistantCatalog({ enabled: true });
  const { createAssistant } = useAssistantMutations();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('__all__');
  const [search, setSearch] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<AssistantCatalogPreset | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const allLabel = t('common.all');
  const tabs = useMemo(() => getTabs(allLabel), [getTabs, allLabel]);
  const visiblePresets = useMemo(
    () => filterPresets(activeTab, search),
    [filterPresets, activeTab, search],
  );

  const openDialog = useCallback((preset: AssistantCatalogPreset) => {
    setSelectedPreset(preset);
  }, []);

  const closeDialog = useCallback(() => {
    setSelectedPreset(null);
    setIsAdding(false);
  }, []);

  const handleConfirmAdd = useCallback(async () => {
    const preset = selectedPreset;
    if (!preset) return;
    setIsAdding(true);
    try {
      await createAssistant(toCreateAssistantDtoFromCatalogPreset(preset));
      toast.show({
        label: t('assistant.toast.addSuccess', { name: preset.name }),
        variant: 'success',
      });
      closeDialog();
    } catch {
      toast.show({
        label: t('assistant.toast.addFailed'),
        variant: 'danger',
      });
    } finally {
      setIsAdding(false);
    }
  }, [selectedPreset, createAssistant, t, toast, closeDialog]);

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<AssistantCatalogPreset>) => (
      <PresetRow preset={item} onPress={openDialog} />
    ),
    [openDialog],
  );

  const keyExtractor = useCallback((item: AssistantCatalogPreset) => item.id, []);

  return (
    <View className="flex-1">
      <BackHeader title={t('library.assistant_catalog.title')} />

      {/* Search */}
      <View className="px-4 pb-3">
        <SelectionSheetSearchField value={search} onChange={setSearch} />
      </View>

      {/* Category tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}
        accessibilityRole="tablist"
        accessibilityLabel={t('assistant.catalog.tabs')}
      >
        {tabs.map((tab) => (
          <Chip
            key={tab.id}
            size="md"
            variant={activeTab === tab.id ? 'primary' : 'soft'}
            onPress={() => setActiveTab(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.id }}
            accessibilityLabel={`${tab.label} (${tab.count})`}
          >
            <Chip.Label>{`${tab.label} (${tab.count})`}</Chip.Label>
          </Chip>
        ))}
      </ScrollView>

      {/* Preset list / empty */}
      {visiblePresets.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4 py-8">
          <Text className="text-default-foreground">
            {search ? t('common.noResults') : t('assistant.catalog.empty')}
          </Text>
        </View>
      ) : (
        <LegendList
          data={visiblePresets}
          estimatedItemSize={72}
          keyExtractor={keyExtractor}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          recycleItems
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 16 }}
          accessibilityRole="list"
          accessibilityLabel={t('assistant.catalog.presetList')}
        />
      )}

      {/* Preview & confirm dialog */}
      <Dialog isOpen={Boolean(selectedPreset)} onOpenChange={(isOpen) => !isOpen && closeDialog()}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress={false} />
          <Dialog.Content className="gap-4 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            {/* Name */}
            <Text className="text-center font-semibold text-foreground text-lg">
              {selectedPreset?.name ?? ''}
            </Text>

            {/* Description */}
            {selectedPreset?.description ? (
              <Text className="text-center text-default-foreground text-sm">
                {selectedPreset.description.replace(/\s+/g, ' ').trim()}
              </Text>
            ) : null}

            {/* Prompt (uneditable multiline) */}
            {selectedPreset?.prompt ? (
              <ScrollView className="max-h-48 rounded-xl bg-surface-secondary px-3 py-2.5">
                <Text className="text-foreground text-sm leading-5">{selectedPreset.prompt}</Text>
              </ScrollView>
            ) : null}

            {/* Actions */}
            <View className="flex-row justify-end gap-3 pt-1">
              <Button
                accessibilityLabel={t('common.cancel')}
                className="min-w-20 rounded-xl"
                size="sm"
                variant="secondary"
                onPress={closeDialog}
              >
                <Text className="text-foreground text-sm">{t('common.cancel')}</Text>
              </Button>
              <Button
                accessibilityLabel={t('assistant.catalog.addToAssistant')}
                className="min-w-24 rounded-xl"
                size="sm"
                variant="primary"
                isDisabled={isAdding}
                onPress={handleConfirmAdd}
              >
                {isAdding ? (
                  <Spinner size="sm" />
                ) : (
                  <Button.Label className="text-white">
                    {t('assistant.catalog.addToAssistant')}
                  </Button.Label>
                )}
              </Button>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </View>
  );
}

const PresetRow = memo(function PresetRow({
  preset,
  onPress,
}: {
  preset: AssistantCatalogPreset;
  onPress: (preset: AssistantCatalogPreset) => void;
}) {
  const description = (preset.description || '').replace(/\s+/g, ' ').trim();
  const summary = description || (preset.prompt || '').replace(/\s+/g, ' ').trim();

  const handlePress = useCallback(() => {
    onPress(preset);
  }, [onPress, preset]);

  return (
    <Pressable
      className="mb-2 flex-row items-center gap-3 overflow-hidden rounded-lg border border-border-subtle bg-card px-3.5 py-2.5 active:opacity-70"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${preset.name}${summary ? `, ${summary}` : ''}`}
    >
      {/* Emoji with blur background */}
      <View className="relative size-9 shrink-0 items-center justify-center rounded-lg overflow-hidden">
        <View className="absolute inset-0 bg-default-soft-hover" />
        <Text className="relative z-10 text-base">{preset.emoji || '🤖'}</Text>
      </View>

      {/* Text area */}
      <View className="min-w-0 flex-1">
        <Text className="truncate font-medium text-foreground text-sm leading-5" numberOfLines={1}>
          {preset.name}
        </Text>
        {summary ? (
          <Text className="truncate text-foreground-secondary text-xs leading-4" numberOfLines={2}>
            {summary}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});
