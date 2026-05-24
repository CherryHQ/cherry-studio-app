import { useCallback } from 'react';

import { useMultiplePreferences } from '@/data/hooks';
import type { UniqueModelId } from '@/data/types/model';
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
