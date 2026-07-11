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

export function useAssistantCatalog({ enabled = true }: { enabled?: boolean } = {}) {
  const { i18n } = useTranslation();
  const language = i18n.language ?? 'en-US';
  const [presets, setPresets] = useState<AssistantCatalogPreset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { createAssistant } = useAssistantMutations();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setIsLoading(true);
    queueMicrotask(() => {
      const data = loadAssistantCatalogPresets(language);
      if (!cancelled) {
        setPresets(data);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
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
