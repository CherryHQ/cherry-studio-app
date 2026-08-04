import { ChevronRightIcon } from 'lucide-uniwind/png';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import {
  getNextModelSelection,
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  ModelPickerBottomSheet,
  type ModelPickerModelItem,
  type ModelSettingKind,
  useModelPickerData,
  useModelSettingSelections,
} from '@/frontend/components/modelPicker';
import { Section } from '@/frontend/components/Section';

const MODEL_SETTING_ICONS = {
  default: '⭐',
  fast: '⚡',
  translate: '🌐',
} as const;

export default function ModelSettingsScreen() {
  const { t } = useTranslation();
  const modelSettings = useModelSettingSelections();
  const modelPickerData = useModelPickerData();
  // Which kind's picker sheet is open (null = none). Each row opens the shared
  // model-picker sheet in place instead of pushing a dedicated selection screen,
  // matching the chat input's picker.
  const [openKind, setOpenKind] = useState<ModelSettingKind | null>(null);

  const closePicker = useCallback(() => setOpenKind(null), []);
  const handleSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (!openKind) {
        return;
      }

      const nextModelId = getNextModelSelection(modelSettings.selections[openKind], item.modelId);
      modelSettings.onSelectionChange(openKind, nextModelId);
      setOpenKind(null);
    },
    [modelSettings, openKind],
  );

  const items = useMemo(
    () =>
      MODEL_SETTING_KINDS.map((kind: ModelSettingKind) => ({
        accessory: (
          <SelectedModelAccessory
            item={modelPickerData.getModelItem(modelSettings.selections[kind])}
            placeholder={t('settings.select.placeholder')}
          />
        ),
        // min-w-6 keeps the emoji column aligned with the icon rows elsewhere.
        leading: (
          <Text className="min-w-6 text-center text-emoji-xl">{MODEL_SETTING_ICONS[kind]}</Text>
        ),
        title: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
        onPress: () => setOpenKind(kind),
      })),
    [modelPickerData, modelSettings.selections, t],
  );

  return (
    <>
      <BackHeader title={t('settings.pages.model.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 px-4 py-5">
          {items.map((item) => (
            <Section key={item.title} items={[item]} />
          ))}
        </View>
      </ScrollView>
      {openKind ? (
        <ModelPickerBottomSheet
          isOpen
          onClose={closePicker}
          onSelect={handleSelect}
          selectedModelId={modelSettings.selections[openKind]}
          title={t(MODEL_SETTING_KIND_TITLE_KEYS[openKind])}
        />
      ) : null}
    </>
  );
}

function SelectedModelAccessory({
  item,
  placeholder,
}: {
  item?: ModelPickerModelItem;
  placeholder: string;
}) {
  return (
    <View className="max-w-[62%] flex-row items-center justify-end gap-1">
      <Text className="min-w-0 shrink text-right text-default-foreground text-sm" numberOfLines={1}>
        {item?.model.name ?? placeholder}
      </Text>
      <ChevronRightIcon className="size-6 text-default-foreground" strokeWidth={2} />
    </View>
  );
}
