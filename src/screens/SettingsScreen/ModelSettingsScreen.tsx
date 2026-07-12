import { useRouter } from 'expo-router';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/components/headers';
import {
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  type ModelPickerModelItem,
  type ModelSettingKind,
  useModelPickerData,
  useModelSettingSelections,
} from '@/components/modelPicker';
import { SettingsSection } from './components/SettingsSection';

const MODEL_SETTING_ICONS = {
  default: '⭐',
  fast: '⚡',
  translate: '🌐',
} as const;

export default function ModelSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const modelSettings = useModelSettingSelections();
  const modelPickerData = useModelPickerData();
  const items = useMemo(
    () =>
      MODEL_SETTING_KINDS.map((kind: ModelSettingKind) => ({
        accessory: (
          <SelectedModelAccessory
            item={modelPickerData.getModelItem(modelSettings.selections[kind])}
            placeholder={t('settings.select.placeholder')}
          />
        ),
        iconEmoji: MODEL_SETTING_ICONS[kind],
        title: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
        onPress: () => router.push(`/settings/model/${kind}`),
      })),
    [modelPickerData.getModelItem, modelSettings.selections, router, t],
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
            <SettingsSection key={item.title} items={[item]} />
          ))}
        </View>
      </ScrollView>
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
