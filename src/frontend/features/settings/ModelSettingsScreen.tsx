import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { Section, useAlert, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
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
      MODEL_SETTING_KINDS.map((kind: ModelSettingKind) => ({
        key: kind,
        disabled: isSaving,
        label: t(MODEL_SETTING_KIND_TITLE_KEYS[kind]),
        onPress: () => setActiveKind(kind),
        trailing: (
          <SelectedModelName
            item={
              kind === 'painting'
                ? imageModelPickerData.getModelItem(draft[kind])
                : textModelPickerData.getModelItem(draft[kind])
            }
            placeholder={t('settings.select.placeholder')}
          />
        ),
      })),
    [draft, imageModelPickerData, isSaving, t, textModelPickerData],
  );
  const selectedModelId = activeKind ? draft[activeKind] : null;

  return (
    <>
      <RouteHeader
        onBack={requestClose}
        rightActions={rightActions}
        title={t('settings.pages.model.title')}
      />
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
