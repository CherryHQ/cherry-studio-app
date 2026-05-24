import { useRouter } from 'expo-router';
import { ChevronsUpDownIcon } from 'lucide-uniwind';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/components/headers';
import {
  getModelSettingOptionLabel,
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  type ModelSettingKind,
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
  const items = useMemo(
    () =>
      MODEL_SETTING_KINDS.map((kind: ModelSettingKind) => ({
        accessory: (
          <View className="max-w-44 flex-row items-center gap-2">
            <Text className="shrink text-default-foreground text-sm" numberOfLines={1}>
              {getModelSettingOptionLabel(modelSettings.selections[kind]) ??
                t('settings.select.placeholder')}
            </Text>
            <ChevronsUpDownIcon className="size-6 text-default-foreground" strokeWidth={2} />
          </View>
        ),
        iconEmoji: MODEL_SETTING_ICONS[kind],
        title: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
        onPress: () =>
          router.push({
            pathname: '/model-picker',
            params: { target: kind },
          }),
      })),
    [modelSettings.selections, router, t],
  );

  return (
    <>
      <BackHeader title={t('settings.pages.model.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1 bg-background"
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
