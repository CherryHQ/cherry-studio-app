import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getNextModelSelection,
  MODEL_SETTING_KIND_TITLE_KEYS,
  MODEL_SETTING_KINDS,
  ModelPickerScreen,
  type ModelPickerModelItem,
  type ModelSettingKind,
  useModelSettingSelections,
} from '@/frontend/components/modelPicker';

/**
 * Which model answers for one of the three settings — the default, the fast one
 * and the translator. The kind travels in the route rather than in a prop, so
 * the screen reads the setting it is editing straight off the URL.
 */
export default function ModelSettingSelectScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();

  if (!isModelSettingKind(kind)) {
    return <Redirect href="/settings/model" />;
  }

  return <ModelSettingPicker kind={kind} />;
}

function ModelSettingPicker({ kind }: { kind: ModelSettingKind }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { onSelectionChange, selections } = useModelSettingSelections();
  const selectedModelId = selections[kind];
  const handleSelect = useCallback(
    (item: ModelPickerModelItem) => {
      // Picking the model already set clears the setting — the only way back to
      // "none" now that the row is a tick-free highlight.
      onSelectionChange(kind, getNextModelSelection(selectedModelId, item.modelId));
      router.back();
    },
    [kind, onSelectionChange, router, selectedModelId],
  );

  return (
    <ModelPickerScreen
      onSelect={handleSelect}
      selectedModelId={selectedModelId}
      title={t(MODEL_SETTING_KIND_TITLE_KEYS[kind])}
    />
  );
}

function isModelSettingKind(kind: string | undefined): kind is ModelSettingKind {
  return MODEL_SETTING_KINDS.some((candidate) => candidate === kind);
}
