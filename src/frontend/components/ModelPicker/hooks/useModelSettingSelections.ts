import { useCallback } from 'react';

import { useMultiplePreferences } from '@/frontend/data/hooks';

import { MODEL_SETTING_PREFERENCE_KEYS } from '../utils/modelSettings';

export function useModelSettingSelections() {
  const [selections, setSelections] = useMultiplePreferences(MODEL_SETTING_PREFERENCE_KEYS);
  const saveSelections = useCallback(
    (nextSelections: typeof selections) => setSelections(nextSelections),
    [setSelections],
  );

  return {
    selections,
    saveSelections,
  };
}
