import { useToast } from 'heroui-native/toast';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateProviderInput } from '@/data/services/ProviderService';
import type { Model, UniqueModelId } from '@/data/types/model';
import type { ApiKeyEntry, Provider } from '@/data/types/provider';
import { useDataServices } from '@/runtime';
import { enableProviderWhenModelsAvailable } from '../../utils/providerEnablement';
import {
  checkProviderModelsHealth,
  createProviderModelHealthPendingStatuses,
  type ProviderModelHealthCheckStatus,
  providerModelCheckTimeoutMs,
} from '../utils/providerModelHealthCheck';

const defaultApiKeySelectValue = '__default__';

type UseProviderModelCheckOptions = {
  apiKeys: readonly ApiKeyEntry[] | undefined;
  models: readonly Model[];
  provider: Provider | undefined;
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
  isSheetOpen: boolean;
  modelStatuses: ProviderModelHealthCheckStatus[];
  providerId: string;
};

export function useProviderModelCheck({
  apiKeys,
  models,
  provider,
  providerId,
}: UseProviderModelCheckOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const services = useDataServices();
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
  const isSheetOpen = isCheckStateCurrent && checkState.isSheetOpen;
  const pendingModelStatuses = useMemo(
    () => (selectedModel ? createProviderModelHealthPendingStatuses([selectedModel]) : []),
    [selectedModel],
  );
  const modelStatuses = isChecking ? checkState.modelStatuses : pendingModelStatuses;
  const resolvedSelectedApiKeyId = selectedApiKey?.value ?? defaultApiKeySelectValue;
  const resolvedSelectedModelId = selectedModel?.id ?? null;

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      runIdRef.current += 1;
    };
  }, []);

  const closeSheet = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    runIdRef.current += 1;
    setCheckState(createProviderModelCheckState(providerId));
  }, [providerId]);

  const openCheckSheet = useCallback(() => {
    if (!providerId || !selectedModel) {
      toast.show({
        label: t('settings.provider.models.checkNoModels'),
        variant: 'danger',
      });
      return;
    }

    setCheckState({
      isChecking: false,
      isSheetOpen: true,
      modelStatuses: pendingModelStatuses,
      providerId,
    });
  }, [pendingModelStatuses, providerId, selectedModel, t, toast]);

  const startCheck = useCallback(async () => {
    if (!providerId || !selectedModel) {
      toast.show({
        label: t('settings.provider.models.checkNoModels'),
        variant: 'danger',
      });
      return;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setCheckState({
      isChecking: true,
      isSheetOpen: true,
      modelStatuses: [{ model: selectedModel, status: 'checking' }],
      providerId,
    });

    const runCheck = async () => {
      const results = await checkProviderModelsHealth(
        {
          apiKey: selectedApiKey,
          checkModel: ({ apiKey, modelId, signal, timeout }) =>
            services.ai.checkModel({
              ...(apiKey !== undefined && { apiKeyOverride: apiKey }),
              ...(signal && { requestOptions: { signal } }),
              timeout,
              uniqueModelId: modelId,
            }),
          models: [selectedModel],
          signal: abortController.signal,
          timeout: providerModelCheckTimeoutMs,
        },
        (result, index) => {
          if (runIdRef.current !== runId) {
            return;
          }

          setCheckState((current) => {
            if (current.providerId !== providerId) {
              return current;
            }

            const updated = [...current.modelStatuses];
            updated[index] = result;
            return { ...current, modelStatuses: updated };
          });
        },
      );

      if (runIdRef.current !== runId) {
        return;
      }

      if (results.length > 0 && results.every((result) => result.status === 'success')) {
        setCheckState((current) =>
          current.providerId === providerId ? { ...current, isSheetOpen: false } : current,
        );
        await enableProviderWhenModelsAvailable(
          provider,
          (updates: UpdateProviderInput) => services.provider.update(providerId, updates),
          models.length,
          'connection_check',
        );
        toast.show({
          label: t('settings.provider.models.checkSuccess'),
          variant: 'success',
        });
        return;
      }

      toast.show({
        label: t('settings.provider.models.checkFailed'),
        variant: 'danger',
      });
    };

    await runCheck()
      .catch(() => {
        if (!abortController.signal.aborted && runIdRef.current === runId) {
          toast.show({
            label: t('settings.provider.models.checkFailed'),
            variant: 'danger',
          });
        }
      })
      .finally(() => {
        if (runIdRef.current === runId) {
          abortControllerRef.current = null;
          setCheckState((current) =>
            current.providerId === providerId ? { ...current, isChecking: false } : current,
          );
        }
      });
  }, [
    models.length,
    provider,
    providerId,
    selectedApiKey,
    selectedModel,
    services.ai,
    services.provider,
    t,
    toast,
  ]);

  const updateSelectedModelId = useCallback((modelId: UniqueModelId) => {
    setSelectedModelId(modelId);
  }, []);

  const updateSelectedApiKeyId = useCallback((apiKeyId: string) => {
    setSelectedApiKeyId(apiKeyId);
  }, []);

  return {
    apiKeyOptions,
    closeSheet,
    isChecking,
    isSheetOpen,
    modelStatuses,
    openCheckSheet,
    selectedApiKeyId: resolvedSelectedApiKeyId,
    selectedModelId: resolvedSelectedModelId,
    setSelectedApiKeyId: updateSelectedApiKeyId,
    setSelectedModelId: updateSelectedModelId,
    startCheck,
  };
}

function createProviderModelCheckState(providerId: string): ProviderModelCheckState {
  return {
    isChecking: false,
    isSheetOpen: false,
    modelStatuses: [],
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
