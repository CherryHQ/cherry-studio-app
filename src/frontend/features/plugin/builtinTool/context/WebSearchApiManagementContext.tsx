import { createContext, use } from 'react';
import type { useTranslation } from 'react-i18next';

import type { WebSearchProviderPreset } from '@/shared/data/presets/webSearchProviders';
import type {
  WebSearchCapability,
  WebSearchProviderFeatureCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
} from '@/shared/data/types/webSearch';

import type { WebSearchProviderCheckPlacement } from '../utils/providerSettings';

export type WebSearchApiManagementContextValue = {
  actions: {
    /** Checks the saved settings with `patch` applied, so a field can be checked before it saves. */
    check: (patch: WebSearchProviderOverride) => void;
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
    /** The field that carries the check button, if this provider can be checked. */
    checkPlacement: WebSearchProviderCheckPlacement;
    isChecking: boolean;
    provider: WebSearchProviderPreset;
    providerCapability: WebSearchProviderFeatureCapability;
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
