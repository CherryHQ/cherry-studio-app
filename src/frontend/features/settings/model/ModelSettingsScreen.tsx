import { Section, useToast } from '@cherrystudio/ui/components';
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
import { PolicyGroup, PolicySelectItem, withResourcePolicy } from '@/frontend/components/Policy';
import { capabilityPolicy } from '@/shared/data/managedPolicy';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

// 快速模型暂无功能接入，暂时隐藏设置入口，待功能接通后恢复。
const VISIBLE_MODEL_SETTING_KINDS = MODEL_SETTING_KINDS.filter((kind) => kind !== 'fast');

function ModelSettingsView() {
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
          empty: !selections[kind],
          label: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
          onPress: () => setActiveKind(kind),
          value:
            item?.model.name ??
            t(selections[kind] ? 'settings.model.unavailable' : 'settings.select.placeholder'),
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
        <PolicyGroup>
          <Section>
            {items.map(({ key, ...item }) => (
              <PolicySelectItem field="defaultModel" key={key} {...item} />
            ))}
          </Section>
        </PolicyGroup>
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

/** Enterprise sync writes these preferences; the organization owns the choice. */
export default withResourcePolicy(ModelSettingsView, () => capabilityPolicy('modelSettings'));
