import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/data/api';
import { useDataServices } from '@/data/runtime';
import type { EndpointType } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import {
  buildProviderModelAddInputs,
  createInitialProviderModelAddFormState,
  getDefaultProviderModelGroupName,
  isNewApiLikeProvider,
  type ProviderModelAddFormState,
  splitProviderModelIds,
} from '../utils/providerModelAdd';

type UseProviderModelAddOptions = {
  provider: Provider | undefined;
  providerId: string;
};

export function useProviderModelAdd({ provider, providerId }: UseProviderModelAddOptions) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const services = useDataServices();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<ProviderModelAddFormState>(() =>
    createInitialProviderModelAddFormState(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modelIdTouched, setModelIdTouched] = useState(false);
  const [endpointTypeTouched, setEndpointTypeTouched] = useState(false);

  const showEndpointTypes = isNewApiLikeProvider(provider);
  const isModelIdValid = splitProviderModelIds(formState.modelId).length > 0;
  const isEndpointTypesValid = !showEndpointTypes || formState.endpointTypes.length > 0;
  const canSubmit = Boolean(provider && providerId && isModelIdValid && isEndpointTypesValid);
  const modelIdError =
    modelIdTouched && !isModelIdValid
      ? t('settings.provider.models.addModelIdRequired')
      : undefined;
  const endpointTypeError =
    endpointTypeTouched && !isEndpointTypesValid
      ? t('settings.provider.models.addEndpointTypeRequired')
      : undefined;

  const providerConfig = useMemo(
    () => ({
      defaultChatEndpoint: provider?.defaultChatEndpoint,
      endpointConfigs: provider?.endpointConfigs,
    }),
    [provider?.defaultChatEndpoint, provider?.endpointConfigs],
  );

  const resetForm = useCallback(() => {
    setFormState(createInitialProviderModelAddFormState());
    setModelIdTouched(false);
    setEndpointTypeTouched(false);
  }, []);

  const updateFormField = useCallback(
    <TField extends keyof ProviderModelAddFormState>(
      field: TField,
      value: ProviderModelAddFormState[TField],
    ) => {
      setFormState((current) => ({
        ...current,
        [field]: value,
      }));
    },
    [],
  );

  const updateModelId = useCallback(
    (value: string) => {
      setModelIdTouched(true);
      setFormState((current) => ({
        ...current,
        group: getDefaultProviderModelGroupName(value, provider?.id),
        modelId: value,
        name: value,
      }));
    },
    [provider?.id],
  );

  const updateName = useCallback(
    (value: string) => {
      updateFormField('name', value);
    },
    [updateFormField],
  );

  const updateGroup = useCallback(
    (value: string) => {
      updateFormField('group', value);
    },
    [updateFormField],
  );

  const updateContextWindow = useCallback(
    (value: string) => {
      updateFormField('contextWindow', value);
    },
    [updateFormField],
  );

  const updateMaxInputTokens = useCallback(
    (value: string) => {
      updateFormField('maxInputTokens', value);
    },
    [updateFormField],
  );

  const updateMaxOutputTokens = useCallback(
    (value: string) => {
      updateFormField('maxOutputTokens', value);
    },
    [updateFormField],
  );

  const updateEndpointTypes = useCallback((endpointTypes: EndpointType[]) => {
    setEndpointTypeTouched(true);
    setFormState((current) => ({
      ...current,
      endpointTypes,
    }));
  }, []);

  const refreshModelQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.models.list({ providerId }) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.models.list({ enabled: true, providerId }),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.models.list() }),
    ]);
  }, [providerId, queryClient]);

  const submitAddModel = useCallback(async () => {
    if (isSubmitting) {
      return false;
    }

    if (!provider || !providerId) {
      return false;
    }

    if (!isModelIdValid) {
      setModelIdTouched(true);
      return false;
    }

    if (!isEndpointTypesValid) {
      setEndpointTypeTouched(true);
      return false;
    }

    setIsSubmitting(true);
    try {
      const existingModels = await services.model.list({ providerId });
      const { duplicateIds, inputs } = buildProviderModelAddInputs({
        existingModels,
        formState,
        provider,
        providerId,
      });

      if (duplicateIds.length > 0) {
        toast.show({
          label: t('settings.provider.models.addDuplicate', {
            ids: duplicateIds.join(', '),
          }),
          variant: 'warning',
        });
      }

      if (inputs.length === 0) {
        return false;
      }

      for (const input of inputs) {
        await services.model.createFromRegistry(input, providerConfig);
      }
      await refreshModelQueries();
      toast.show({
        label: t('settings.provider.models.addSuccess', { count: inputs.length }),
        variant: 'success',
      });
      resetForm();
      return true;
    } catch {
      toast.show({
        label: t('settings.provider.models.addFailed'),
        variant: 'danger',
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    formState,
    isEndpointTypesValid,
    isModelIdValid,
    isSubmitting,
    provider,
    providerConfig,
    providerId,
    refreshModelQueries,
    resetForm,
    services.model,
    t,
    toast,
  ]);

  return {
    canSubmit,
    endpointTypeError,
    formState,
    isSubmitting,
    modelIdError,
    resetForm,
    showEndpointTypes,
    submitAddModel,
    updateContextWindow,
    updateEndpointTypes,
    updateGroup,
    updateMaxInputTokens,
    updateMaxOutputTokens,
    updateModelId,
    updateName,
  };
}
