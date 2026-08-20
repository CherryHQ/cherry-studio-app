import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
} from '@cherrystudio/universal/data/preference';
import type { WebSearchProviderPreset } from '@cherrystudio/universal/data/presets/webSearchProviders';
import { createContext, use } from 'react';
import type { useTranslation } from 'react-i18next';

export type WebSearchApiManagementContextValue = {
  actions: {
    onProviderOverrideChange: (
      providerId: WebSearchProviderId,
      patch: WebSearchProviderOverride,
    ) => void;
    openZhipuApiKeySettings: () => void;
  };
  meta: {
    t: ReturnType<typeof useTranslation>['t'];
  };
  state: {
    capability: WebSearchCapability;
    provider: WebSearchProviderPreset;
    providerOverride: WebSearchProviderOverride | undefined;
  };
};

export const WebSearchApiManagementContext =
  createContext<WebSearchApiManagementContextValue | null>(null);

export function useWebSearchApiManagementContext() {
  const context = use(WebSearchApiManagementContext);

  if (!context) {
    throw new Error(
      'useWebSearchApiManagementContext must be used within WebSearchApiManagementContext',
    );
  }

  return context;
}
