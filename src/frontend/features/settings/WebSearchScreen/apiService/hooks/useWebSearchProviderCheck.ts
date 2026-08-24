import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import type { WebSearchProviderPreset } from '@/shared/data/presets/webSearchProviders';
import type {
  WebSearchCapability,
  WebSearchProvider,
  WebSearchProviderOverride,
} from '@/shared/data/types/webSearch';

export function useWebSearchProviderCheck(
  provider: WebSearchProviderPreset,
  providerOverride: WebSearchProviderOverride | undefined,
  capability: WebSearchCapability,
) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const webSearch = useBackendModule('webSearch');
  const [isChecking, setIsChecking] = useState(false);
  const checkRunIdRef = useRef(0);

  useEffect(
    () => () => {
      checkRunIdRef.current += 1;
    },
    [],
  );

  const startCheck = async (apiKey: string) => {
    const trimmedApiKey = apiKey.trim();
    if (isChecking || !trimmedApiKey) {
      return;
    }

    setIsChecking(true);
    const runId = checkRunIdRef.current + 1;
    checkRunIdRef.current = runId;

    try {
      const result = await webSearch.checkProvider({
        capability,
        provider: buildCheckProviderConfig(provider, providerOverride, trimmedApiKey),
      });

      if (checkRunIdRef.current !== runId) {
        return;
      }

      if (result.valid) {
        toast.show({ label: t('settings.websearch.provider.checkSuccess'), variant: 'success' });
      } else {
        alert.show({
          description: result.error || t('settings.websearch.provider.checkFailed'),
          title: t('settings.websearch.provider.checkFailed'),
        });
      }
    } catch (error) {
      if (checkRunIdRef.current === runId) {
        alert.show({
          description:
            error instanceof Error ? error.message : t('settings.websearch.provider.checkFailed'),
          title: t('settings.websearch.provider.checkFailed'),
        });
      }
    } finally {
      if (checkRunIdRef.current === runId) {
        setIsChecking(false);
      }
    }
  };

  return { isChecking, startCheck };
}

export function buildCheckProviderConfig(
  provider: WebSearchProviderPreset,
  override: WebSearchProviderOverride | undefined,
  selectedApiKey: string,
): WebSearchProvider {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    apiKeys: [selectedApiKey],
    capabilities: provider.capabilities.map((capability) => {
      const apiHostOverride = override?.capabilities?.[capability.feature]?.apiHost;

      if (capability.apiHost === undefined || apiHostOverride === undefined) {
        return capability;
      }

      return { ...capability, apiHost: apiHostOverride.trim() };
    }),
    engines: override?.engines?.flatMap((engine) => engine.trim() || []) ?? [],
    basicAuthUsername: override?.basicAuthUsername?.trim() ?? '',
    basicAuthPassword: override?.basicAuthPassword?.trim() ?? '',
  };
}
