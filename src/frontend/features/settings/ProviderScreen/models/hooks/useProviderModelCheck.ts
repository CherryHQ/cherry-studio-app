import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { Model } from '@/shared/data/types/model';
import type { ApiKeyEntry } from '@/shared/data/types/provider';

import { resolveProviderModelCheckModel } from '../utils/providerModelCheckSelection';
import {
  createProviderModelHealthPendingStatuses,
  type ProviderModelHealthCheckStatus,
  providerModelCheckTimeoutMs,
} from '../utils/providerModelHealthCheck';

type UseProviderModelCheckOptions = {
  apiKeys: readonly ApiKeyEntry[] | undefined;
  models: readonly Model[];
  providerId: string;
  selectedModelId?: string;
};

type ProviderModelCheckState = {
  isChecking: boolean;
  modelStatus: ProviderModelHealthCheckStatus | null;
  providerId: string;
  /** What the result is about, so it stops being shown once it isn't. */
  selectionKey: string;
};

export function useProviderModelCheck({
  apiKeys,
  models,
  providerId,
  selectedModelId,
}: UseProviderModelCheckOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { alert } = useAlert();
  const modelsBackend = useBackendModule('models');
  const queryClient = useQueryClient();
  const [checkState, setCheckState] = useState<ProviderModelCheckState>(() =>
    createProviderModelCheckState(providerId),
  );
  const runIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const selectedModel = useMemo(
    () => resolveProviderModelCheckModel(models, selectedModelId),
    [models, selectedModelId],
  );
  const selectedApiKey = useMemo(() => apiKeys?.find((apiKey) => apiKey.isEnabled), [apiKeys]);
  const selectionKey = createProviderModelCheckSelectionKey({ selectedApiKey, selectedModel });
  const isChecking = checkState.providerId === providerId && checkState.isChecking;
  // A result belongs to the model and key it ran with. Changing either means
  // the answer on screen is no longer the current question.
  const modelStatus =
    checkState.providerId === providerId &&
    checkState.selectionKey === selectionKey &&
    checkState.modelStatus
      ? checkState.modelStatus
      : (createProviderModelHealthPendingStatuses(selectedModel ? [selectedModel] : [])[0] ?? null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      runIdRef.current += 1;
    };
  }, []);

  const startCheck = useCallback(async () => {
    if (!providerId || !selectedModel || isChecking) {
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setCheckState({
      isChecking: true,
      modelStatus: { model: selectedModel, status: 'checking' },
      providerId,
      selectionKey,
    });

    try {
      const results = await modelsBackend.checkHealth({
        ...(selectedApiKey?.key !== undefined && { apiKey: selectedApiKey.key }),
        modelIds: [selectedModel.id],
        onResult: (result) => {
          if (runIdRef.current === runId) {
            setCheckState({ isChecking: true, modelStatus: result, providerId, selectionKey });
          }
        },
        providerId,
        signal: abortController.signal,
        timeoutMs: providerModelCheckTimeoutMs,
      });

      if (runIdRef.current !== runId) {
        return;
      }

      const result = results[0] ?? { model: selectedModel, status: 'failed' as const };
      setCheckState({ isChecking: false, modelStatus: result, providerId, selectionKey });

      if (result?.status === 'success') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
          queryClient.invalidateQueries({ queryKey: queryKeys.providers.page() }),
        ]);
        toast.show({
          label: t('settings.provider.models.checkSuccess'),
          variant: 'success',
        });
      } else {
        alert.show({
          description: result.error || t('settings.provider.models.checkFailedStatus'),
          title: t('settings.provider.models.checkFailed'),
        });
      }
    } catch (error) {
      if (!abortController.signal.aborted && runIdRef.current === runId) {
        setCheckState({
          isChecking: false,
          modelStatus: {
            error: error instanceof Error ? error.message : undefined,
            model: selectedModel,
            status: 'failed',
          },
          providerId,
          selectionKey,
        });
        alert.show({
          description:
            error instanceof Error
              ? error.message
              : t('settings.provider.models.checkFailedStatus'),
          title: t('settings.provider.models.checkFailed'),
        });
      }
    } finally {
      if (runIdRef.current === runId) {
        abortControllerRef.current = null;
        setCheckState((current) => ({ ...current, isChecking: false }));
      }
    }
  }, [
    isChecking,
    modelsBackend,
    providerId,
    queryClient,
    selectedApiKey,
    selectedModel,
    selectionKey,
    alert,
    t,
    toast,
  ]);

  return {
    isChecking,
    modelStatus,
    selectedApiKey,
    selectedModel,
    startCheck,
  };
}

function createProviderModelCheckState(providerId: string): ProviderModelCheckState {
  return {
    isChecking: false,
    modelStatus: null,
    providerId,
    selectionKey: '',
  };
}

function createProviderModelCheckSelectionKey({
  selectedApiKey,
  selectedModel,
}: {
  selectedApiKey: ApiKeyEntry | undefined;
  selectedModel: Model | null;
}): string {
  return `${selectedModel?.id ?? ''}|${selectedApiKey?.id ?? ''}`;
}
