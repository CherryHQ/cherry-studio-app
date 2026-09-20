import { Section, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useOpenProviderSetup } from '@/frontend/appShell/navigation';
import { ModelAvatar } from '@/frontend/components/Avatar';
import {
  getNextModelSelection,
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  ModelPickerDrawer,
  type ModelPickerModelItem,
  type ModelSettingKind,
  useModelPickerData,
  useModelSettingSelections,
} from '@/frontend/components/ModelPicker';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

// 快速模型尚未接入功能；翻译模型用于临时翻译及兼容的系统入口。
const VISIBLE_MODEL_SETTING_KINDS = MODEL_SETTING_KINDS.filter((kind) => kind !== 'fast');

export default function ModelSettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { saveSelections, selections } = useModelSettingSelections();
  const openProviderSetup = useOpenProviderSetup();
  const [isSaving, setIsSaving] = useState(false);
  const imageModelPickerData = useModelPickerData({ modelType: 'image' });
  const textModelPickerData = useModelPickerData({ modelType: 'text' });
  const [activeKind, setActiveKind] = useState<ModelSettingKind>();
  const closeModelPicker = useCallback(() => setActiveKind(undefined), []);
  const handleAddProvider = useCallback(() => {
    setActiveKind(undefined);
    openProviderSetup();
  }, [openProviderSetup]);
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (!activeKind || isSaving) {
        return;
      }

      setIsSaving(true);
      setActiveKind(undefined);
      void saveSelections({
        [activeKind]: getNextModelSelection(selections[activeKind], item.modelId),
      })
        .then(() => {
          toast.show({ label: t('settings.model.saved'), variant: 'success' });
        })
        .catch(() => {
          toast.show({ label: t('settings.model.saveFailed'), variant: 'danger' });
        })
        .finally(() => setIsSaving(false));
    },
    [activeKind, isSaving, saveSelections, selections, t, toast],
  );
  const items = useMemo(
    () =>
      VISIBLE_MODEL_SETTING_KINDS.map((kind: ModelSettingKind) => {
        const item =
          kind === 'painting'
            ? imageModelPickerData.getModelItem(selections[kind])
            : textModelPickerData.getModelItem(selections[kind]);

        return {
          key: kind,
          disabled: isSaving,
          label: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
          onPress: () => setActiveKind(kind),
          value: item?.model.name ?? t('settings.select.placeholder'),
          valueLeading: item ? (
            <ModelAvatar model={item.model} provider={item.provider} />
          ) : undefined,
        };
      }),
    [imageModelPickerData, isSaving, selections, t, textModelPickerData],
  );
  const selectedModelId = activeKind ? selections[activeKind] : null;

  return (
    <>
      <SettingsScrollPage headerProps={{ title: t('settings.pages.model.title') }}>
        <Section>
          {items.map(({ key, ...item }) => (
            <Section.SelectItem key={key} {...item} />
          ))}
          <Section.Item
            label={t('translation.settings.title')}
            onPress={() => router.push('/settings/model/translation')}
          />
        </Section>
      </SettingsScrollPage>
      {activeKind ? (
        <ModelPickerDrawer
          modelType={activeKind === 'painting' ? 'image' : 'text'}
          open
          onAddProvider={handleAddProvider}
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
          title={t(MODEL_SETTING_KIND_TITLE_KEYS[activeKind])}
        />
      ) : null}
    </>
  );
}
