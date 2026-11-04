import { useModelSettingSelections } from '@/frontend/components/ModelPicker';
import { usePreference } from '@/frontend/data/hooks';
import { useModels } from '@/frontend/hooks/chat/useModel';
import { useProviders } from '@/frontend/hooks/chat/useProvider';

import { resolveEffectiveTaskModel } from '../utils/effectiveTaskModel';

export function useEffectiveTaskModels() {
  const { selections } = useModelSettingSelections();
  const [namingEnabled] = usePreference('agent.session_naming.enabled');
  const { models, isLoading: modelsLoading, modelsQuery } = useModels();
  const { providers, isLoading: providersLoading, error } = useProviders();
  const common = {
    models,
    providers,
    namingEnabled,
    defaultId: selections.default,
    isLoading: modelsLoading || providersLoading,
    hasError: Boolean(modelsQuery.error || error),
  };
  return {
    naming: resolveEffectiveTaskModel({
      ...common,
      kind: 'naming',
      configuredId: selections.naming,
    }),
    translate: resolveEffectiveTaskModel({
      ...common,
      kind: 'translate',
      configuredId: selections.translate,
    }),
    painting: resolveEffectiveTaskModel({
      ...common,
      kind: 'painting',
      configuredId: selections.painting,
    }),
  };
}
