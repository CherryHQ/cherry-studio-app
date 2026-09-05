import { type Href, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { useProviderApiServiceSheetClose } from '../../../apiService';
import { useProviderSetup } from '../../../hooks/useProviderSetup';
import type { ProviderModelTaskProps } from '../types';

/** Shared completion and navigation; each task owns its form or synchronization state. */
export function useProviderModelTask({
  provider,
  returnTo,
  shouldEnableProvider,
  hasUnsavedChanges = false,
  isSaving,
  beforeNavigate,
}: ProviderModelTaskProps & {
  hasUnsavedChanges?: boolean;
  isSaving: boolean;
  beforeNavigate?: () => void;
}) {
  const router = useRouter();
  const { completeSetup } = useProviderSetup();
  const [isEnabling, setIsEnabling] = useState(false);
  const [hasSavedModels, setHasSavedModels] = useState(false);
  const enablePending = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const { allowNavigation, closeWithoutPrompt, requestClose } = useProviderApiServiceSheetClose({
    hasUnsavedChanges: hasUnsavedChanges && !hasSavedModels,
    isSaving: isSaving || isEnabling,
  });

  async function completeFlow() {
    if (enablePending.current) return;
    if (shouldEnableProvider) {
      enablePending.current = true;
      setIsEnabling(true);
      const enabled = await completeSetup(provider.id);
      enablePending.current = false;
      if (!active.current) return;
      setIsEnabling(false);
      if (!enabled) return;
    }
    beforeNavigate?.();
    if (returnTo) {
      allowNavigation();
      router.dismissTo(returnTo as Href);
    } else {
      closeWithoutPrompt();
    }
  }

  async function completeAfterSave() {
    if (!active.current) return;
    setHasSavedModels(true);
    await completeFlow();
  }

  const detailReturnTo = `/settings/provider/${encodeURIComponent(provider.id)}?tab=models`;
  function openConfiguration() {
    beforeNavigate?.();
    allowNavigation();
    router.replace({
      pathname: '/settings/provider/new',
      params: {
        providerId: provider.id,
        providerName: provider.name,
        intent: shouldEnableProvider ? 'enable' : 'sync',
        returnTo: returnTo ?? detailReturnTo,
      },
    });
  }
  function openManualAdd() {
    beforeNavigate?.();
    allowNavigation();
    router.replace({
      pathname: '/settings/provider/[providerId]/model-add',
      params: {
        providerId: provider.id,
        mode: 'manual',
        returnTo: returnTo ?? detailReturnTo,
        ...(shouldEnableProvider ? { enableProvider: 'true' } : {}),
      },
    });
  }

  return {
    completeAfterSave,
    completeFlow,
    hasSavedModels,
    isEnabling,
    openConfiguration,
    openManualAdd,
    requestClose,
  };
}
