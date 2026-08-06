import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { ApiKeyEntry } from '@cherrystudio/universal/data/types/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAppAlert } from '@/frontend/components/AppAlertProvider';
import { queryKeys, useBackendModule } from '@/frontend/data';

import {
  createProviderModelHealthPendingStatuses,
  type ProviderModelHealthCheckStatus,
  providerModelCheckTimeoutMs,
} from '../utils/providerModelHealthCheck';

const defaultApiKeySelectValue = '__default__';

type UseProviderModelCheckOptions = {
  apiKeys: readonly ApiKeyEntry[] | undefined;
  models: readonly Model[];
  providerId: string;
};

export type ProviderModelCheckApiKeyOption = {
  id: string;
  key?: string;
  label: string;
  value: string;
};

type ProviderModelCheckState = {
  isChecking: boolean;
  modelStatus: ProviderModelHealthCheckStatus | null;
  providerId: string;
};

export function useProviderModelCheck({
  apiKeys,
  models,
  providerId,
}: UseProviderModelCheckOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { showMessage } = useAppAlert();
  const modelsBackend = useBackendModule('models');
  const queryClient = useQueryClient();
  const [checkState, setCheckState] = useState<ProviderModelCheckState>(() =>
    createProviderModelCheckState(providerId),
  );
  const [selectedModelId, setSelectedModelId] = useState<UniqueModelId | null>(null);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState<string>(defaultApiKeySelectValue);
  const runIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const enabledApiKeys = useMemo(
    () => apiKeys?.filter((apiKey) => apiKey.isEnabled) ?? [],
    [apiKeys],
  );
  const apiKeyOptions = useMemo<ProviderModelCheckApiKeyOption[]>(() => {
    const options = enabledApiKeys.map((apiKey, index) => ({
      id: apiKey.id,
      key: apiKey.key,
      label:
        apiKey.label?.trim() ||
        t('settings.provider.models.checkApiKeyFallback', {
          index: index + 1,
          key: maskProviderModelCheckApiKey(apiKey.key),
        }),
      value: apiKey.id,
    }));

    return options.length > 0
      ? options
      : [
          {
            id: defaultApiKeySelectValue,
            label: t('settings.provider.models.checkDefaultApiKey'),
            value: defaultApiKeySelectValue,
          },
        ];
  }, [enabledApiKeys, t]);
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? models[0] ?? null,
    [models, selectedModelId],
  );
  const selectedApiKey = useMemo(
    () => apiKeyOptions.find((option) => option.value === selectedApiKeyId) ?? apiKeyOptions[0],
    [apiKeyOptions, selectedApiKeyId],
  );
  const isCheckStateCurrent = checkState.providerId === providerId;
  const isChecking = isCheckStateCurrent && checkState.isChecking;
  const modelStatus =
    isCheckStateCurrent && checkState.modelStatus
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
    });

    try {
      const results = await modelsBackend.checkHealth({
        ...(selectedApiKey?.key !== undefined && { apiKey: selectedApiKey.key }),
        modelIds: [selectedModel.id],
        onResult: (result) => {
          if (runIdRef.current === runId) {
            setCheckState({ isChecking: true, modelStatus: result, providerId });
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
      setCheckState({ isChecking: false, modelStatus: result, providerId });

      if (result?.status === 'success') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.providers.detail(providerId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.providers.list() }),
        ]);
        toast.show({
          label: t('settings.provider.models.checkSuccess'),
          variant: 'success',
        });
      } else {
        showMessage({
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
        });
        showMessage({
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
    showMessage,
    t,
    toast,
  ]);

  const updateSelectedModelId = useCallback((modelId: UniqueModelId) => {
    setSelectedModelId(modelId);
    setCheckState((current) => ({ ...current, modelStatus: null }));
  }, []);

  const updateSelectedApiKeyId = useCallback((apiKeyId: string) => {
    setSelectedApiKeyId(apiKeyId);
    setCheckState((current) => ({ ...current, modelStatus: null }));
  }, []);

  return {
    apiKeyOptions,
    isChecking,
    modelStatus,
    selectedApiKey,
    selectedModel,
    setSelectedApiKeyId: updateSelectedApiKeyId,
    setSelectedModelId: updateSelectedModelId,
    startCheck,
  };
}

function createProviderModelCheckState(providerId: string): ProviderModelCheckState {
  return {
    isChecking: false,
    modelStatus: null,
    providerId,
  };
}

function maskProviderModelCheckApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
