import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { Section } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/components/headers';
import {
  getNextModelSelection,
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  ModelPickerDrawer,
  type ModelPickerModelItem,
  type ModelSettingKind,
  useModelPickerData,
  useModelSettingSelections,
} from '@/frontend/components/modelPicker';

const IMAGE_GENERATION_MODEL_TAGS = [MODEL_CAPABILITY.IMAGE_GENERATION] as const;

export default function ModelSettingsScreen() {
  const { t } = useTranslation();
  const { onSelectionChange, selections } = useModelSettingSelections();
  const modelPickerData = useModelPickerData();
  const [activeKind, setActiveKind] = useState<ModelSettingKind>();
  const closeModelPicker = useCallback(() => setActiveKind(undefined), []);
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (!activeKind) {
        return;
      }

      onSelectionChange(activeKind, getNextModelSelection(selections[activeKind], item.modelId));
      setActiveKind(undefined);
    },
    [activeKind, onSelectionChange, selections],
  );
  const items = useMemo(
    () =>
      MODEL_SETTING_KINDS.map((kind: ModelSettingKind) => ({
        key: kind,
        label: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
        onPress: () => setActiveKind(kind),
        trailing: (
          <SelectedModelName
            item={modelPickerData.getModelItem(selections[kind])}
            placeholder={t('settings.select.placeholder')}
          />
        ),
      })),
    [modelPickerData, selections, t],
  );
  const selectedModelId = activeKind ? selections[activeKind] : null;

  return (
    <>
      <RouteHeader title={t('settings.pages.model.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 py-5">
          <Section>
            {items.map(({ key, ...item }) => (
              <Section.Item key={key} {...item} />
            ))}
          </Section>
        </View>
      </ScrollView>
      {activeKind ? (
        <ModelPickerDrawer
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
          selectedTags={activeKind === 'painting' ? IMAGE_GENERATION_MODEL_TAGS : undefined}
          title={t(MODEL_SETTING_KIND_TITLE_KEYS[activeKind])}
        />
      ) : null}
    </>
  );
}

function SelectedModelName({
  item,
  placeholder,
}: {
  item?: ModelPickerModelItem;
  placeholder: string;
}) {
  return (
    <View className="min-w-0 flex-row items-center justify-end gap-1">
      <Text className="min-w-0 shrink text-right text-foreground text-sm" numberOfLines={1}>
        {item?.model.name ?? placeholder}
      </Text>
      <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
    </View>
  );
}
