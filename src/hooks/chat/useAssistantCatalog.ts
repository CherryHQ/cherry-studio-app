import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AssistantCatalogPreset,
  type AssistantCatalogTab,
  buildAssistantCatalogTabs,
  filterAssistantCatalogPresets,
  loadAssistantCatalogPresets,
  toCreateAssistantDtoFromCatalogPreset,
} from '@/data/presets/assistantCatalogService';
import { useAssistantMutations } from '@/hooks/chat/useAssistant';

export interface UseAssistantCatalogReturn {
  isLoading: boolean;
  presets: AssistantCatalogPreset[];
  addPreset: (preset: AssistantCatalogPreset) => Promise<{ id: string }>;
  getTabs: (allLabel: string) => AssistantCatalogTab[];
  filterPresets: (activeTab: string, search: string) => AssistantCatalogPreset[];
}
export function useAssistantCatalog({ enabled = true }: { enabled?: boolean } = {}) {
  const { i18n } = useTranslation();
  const language = i18n.language ?? 'en-US';
  const [presets, setPresets] = useState<AssistantCatalogPreset[]>(() =>
    enabled ? loadAssistantCatalogPresets(language) : [],
  );
  const isLoading = false;
  const { createAssistant } = useAssistantMutations();
  useEffect(() => {
    if (!enabled) return;
    const data = loadAssistantCatalogPresets(language);
    setPresets(data);
  }, [enabled, language]);

  const addPreset = useCallback(
    async (preset: AssistantCatalogPreset) => {
      return createAssistant(toCreateAssistantDtoFromCatalogPreset(preset));
    },
    [createAssistant],
  );

  const getTabs = useCallback(
    (allLabel: string): AssistantCatalogTab[] => buildAssistantCatalogTabs(presets, allLabel),
    [presets],
  );

  const filterPresets = useCallback(
    (activeTab: string, search: string) =>
      filterAssistantCatalogPresets(presets, activeTab, search),
    [presets],
  );

  return { isLoading, presets, addPreset, getTabs, filterPresets };
}
