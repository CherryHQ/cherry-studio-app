import { useCallback } from 'react';
import type { UniqueModelId } from '@/data/types/model';
import { useMultiplePreferences } from '@/hooks/data';
import type { ModelSettingKind } from '../utils/modelSettings';
import { MODEL_SETTING_PREFERENCE_KEYS } from '../utils/modelSettings';

export function useModelSettingSelections() {
  const [selections, setSelections] = useMultiplePreferences(MODEL_SETTING_PREFERENCE_KEYS);

  const handleSelectionChange = useCallback(
    (kind: ModelSettingKind, modelId: UniqueModelId | null) => {
      void setSelections({ [kind]: modelId });
    },
    [setSelections],
  );

  return {
    selections,
    onSelectionChange: handleSelectionChange,
  };
}
