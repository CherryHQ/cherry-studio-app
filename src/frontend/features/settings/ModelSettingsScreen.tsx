import { Section, useAlert, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from '@/frontend/components/headers';
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

import { SettingsScrollPage } from './components/SettingsScrollPage';

export default function ModelSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { saveSelections, selections: savedSelections } = useModelSettingSelections();
  const [draft, setDraft] = useState(savedSelections);
  const [baseline, setBaseline] = useState(savedSelections);
  const [isSaving, setIsSaving] = useState(false);
  const imageModelPickerData = useModelPickerData({ modelType: 'image' });
  const textModelPickerData = useModelPickerData({ modelType: 'text' });
  const [activeKind, setActiveKind] = useState<ModelSettingKind>();
  const closeModelPicker = useCallback(() => setActiveKind(undefined), []);
  const handleModelSelect = useCallback(
    (item: ModelPickerModelItem) => {
      if (!activeKind) {
        return;
      }

      setDraft((current) => ({
        ...current,
        [activeKind]: getNextModelSelection(current[activeKind], item.modelId),
      }));
      setActiveKind(undefined);
    },
    [activeKind],
  );
  const isDirty = MODEL_SETTING_KINDS.some((kind) => draft[kind] !== baseline[kind]);
  const handleSave = useCallback(() => {
    if (!isDirty || isSaving) {
      return;
    }

    setIsSaving(true);
    void saveSelections(draft)
      .then(() => {
        setBaseline(draft);
        toast.show({ label: t('settings.model.saved'), variant: 'success' });
      })
      .catch(() => {
        alert.show({ title: t('settings.model.saveFailed') });
      })
      .finally(() => setIsSaving(false));
  }, [alert, draft, isDirty, isSaving, saveSelections, t, toast]);
  const requestClose = useCallback(() => {
    if (isSaving) {
      return;
    }

    if (!isDirty) {
      router.back();
      return;
    }

    alert.confirm({
      confirmLabel: t('common.discard'),
      description: t('settings.model.discardMessage'),
      onConfirm: () => router.back(),
      role: 'destructive',
      title: t('settings.model.discardTitle'),
    });
  }, [alert, isDirty, isSaving, router, t]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.save'),
        disabled: !isDirty || isSaving,
        key: 'save-model-settings',
        label: isSaving ? t('common.saving') : t('common.save'),
        onPress: handleSave,
        type: 'label',
      },
    ],
    [handleSave, isDirty, isSaving, t],
  );
  const items = useMemo(
    () =>
      MODEL_SETTING_KINDS.map((kind: ModelSettingKind) => {
        const item =
          kind === 'painting'
            ? imageModelPickerData.getModelItem(draft[kind])
            : textModelPickerData.getModelItem(draft[kind]);

        return {
          key: kind,
          disabled: isSaving,
          label: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
          onPress: () => setActiveKind(kind),
          value: item?.model.name ?? t('settings.select.placeholder'),
        };
      }),
    [draft, imageModelPickerData, isSaving, t, textModelPickerData],
  );
  const selectedModelId = activeKind ? draft[activeKind] : null;

  return (
    <>
      <SettingsScrollPage
        headerProps={{
          onBack: requestClose,
          rightActions,
          title: t('settings.pages.model.title'),
        }}
      >
        <Section>
          {items.map(({ key, ...item }) => (
            <Section.SelectItem key={key} {...item} />
          ))}
        </Section>
      </SettingsScrollPage>
      {activeKind ? (
        <ModelPickerDrawer
          modelType={activeKind === 'painting' ? 'image' : 'text'}
          open
          onClose={closeModelPicker}
          onSelect={handleModelSelect}
          selectedModelId={selectedModelId}
          title={t(MODEL_SETTING_KIND_TITLE_KEYS[activeKind])}
        />
      ) : null}
    </>
  );
}
