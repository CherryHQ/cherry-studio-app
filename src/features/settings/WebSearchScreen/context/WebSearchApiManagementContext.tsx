import { createContext, use } from 'react';
import type { useTranslation } from 'react-i18next';

import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderId,
  WebSearchProviderOverride,
} from '@/data/preference';
import type { WebSearchProviderPreset } from '@/data/presets/webSearchProviders';

export type WebSearchApiManagementContextValue = {
  actions: {
    onCapabilityApiHostChange: (
      providerId: WebSearchProviderId,
      capability: WebSearchCapability,
      apiHost: string,
    ) => void;
    onProviderOverrideChange: (
      providerId: WebSearchProviderId,
      patch: WebSearchProviderOverride,
    ) => void;
    openApiKeySettings: () => void;
    openZhipuApiKeySettings: () => void;
    checkProvider: (
      provider: WebSearchProvider,
      capability?: WebSearchCapability,
    ) => Promise<{ error?: string; valid: boolean }>;
  };
  meta: {
    t: ReturnType<typeof useTranslation>['t'];
  };
  state: {
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
