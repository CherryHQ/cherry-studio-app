import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import type {
  WebSearchCapability,
  WebSearchProviderId,
  WebSearchProviderOverride,
} from '@/shared/data/types/webSearch';

/** Checks the settings on screen, saved or not, with one real lookup. */
export function useWebSearchProviderCheck(
  providerId: WebSearchProviderId,
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

  const startCheck = async (override: WebSearchProviderOverride) => {
    if (isChecking) {
      return;
    }

    setIsChecking(true);
    const runId = checkRunIdRef.current + 1;
    checkRunIdRef.current = runId;

    try {
      const result = await webSearch.checkProvider({ capability, override, providerId });

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
