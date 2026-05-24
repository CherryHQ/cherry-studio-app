import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { CloseHeader } from '@/components/headers';
import {
  getNextModelSelection,
  isModelPickerTarget,
  MODEL_SETTING_OPTIONS,
  ModelPickerSheetContent,
  type ModelSettingOption,
  useModelSettingSelections,
} from '@/components/modelPicker';

export default function ModelPickerScreen() {
  const { target } = useLocalSearchParams<{ target?: string }>();
  const router = useRouter();
  const modelSettings = useModelSettingSelections();
  const validTarget = isModelPickerTarget(target) ? target : undefined;

  const closeSheet = useCallback(() => {
    router.back();
  }, [router]);

  const handleModelPress = useCallback(
    (option: ModelSettingOption) => {
      if (!validTarget) {
        return;
      }

      const nextModelId = getNextModelSelection(modelSettings.selections[validTarget], option.id);

      modelSettings.onSelectionChange(validTarget, nextModelId);
      closeSheet();
    },
    [closeSheet, modelSettings, validTarget],
  );

  if (!validTarget) {
    return <Redirect href="/settings/model" />;
  }

  return (
    <>
      <CloseHeader />
      <ModelPickerSheetContent
        options={MODEL_SETTING_OPTIONS}
        selectedModelId={modelSettings.selections[validTarget]}
        onSelect={handleModelPress}
      />
    </>
  );
}
