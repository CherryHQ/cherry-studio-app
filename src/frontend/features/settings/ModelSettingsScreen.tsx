import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/components/headers';
import {
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  type ModelPickerModelItem,
  type ModelSettingKind,
  useModelPickerData,
  useModelSettingSelections,
} from '@/frontend/components/modelPicker';

export default function ModelSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const modelSettings = useModelSettingSelections();
  const modelPickerData = useModelPickerData();
  // The three settings are one choice made three times, so they share one card
  // rather than sitting in three of their own. Each pushes the picker as a
  // screen: it is a search through every model on the device, which wants the
  // whole height and a back button rather than a sheet over this list.
  const items = useMemo(
    () =>
      MODEL_SETTING_KINDS.map((kind: ModelSettingKind) => ({
        key: kind,
        label: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
        onPress: () => router.push(`/settings/model/${kind}`),
        showChevron: true,
        trailing: (
          <SelectedModelName
            item={modelPickerData.getModelItem(modelSettings.selections[kind])}
            placeholder={t('settings.select.placeholder')}
          />
        ),
      })),
    [modelPickerData, modelSettings.selections, router, t],
  );

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
    <Text className="min-w-0 shrink text-right text-foreground text-sm" numberOfLines={1}>
      {item?.model.name ?? placeholder}
    </Text>
  );
}
