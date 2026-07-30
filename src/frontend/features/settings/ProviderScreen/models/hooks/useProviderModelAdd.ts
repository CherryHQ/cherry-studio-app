import { useQueryClient } from '@tanstack/react-query';
import { useToast } from 'heroui-native/toast';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys } from '@/frontend/data';
import { useDataServices } from '@/runtime';
import type { EndpointType } from '@/shared/domain/model';
import type { Provider } from '@/shared/domain/provider';

import {
  buildProviderModelAddInputs,
  createInitialProviderModelAddFormState,
  getDefaultProviderModelGroupName,
  isNewApiLikeProvider,
  type ProviderModelAddFormState,
  splitProviderModelIds,
} from '../utils/providerModelAdd';

/**
 * Add-model form state. Takes a loaded provider because the provider decides the form's
 * shape (`showEndpointTypes`) and the default group name — reading those off a provider
 * that is still loading would render the form without its endpoint-type block and then
 * grow it a commit later, on top of computing the group name from `undefined`.
 */
type UseProviderModelAddOptions = {
  provider: Provider;
};

export function useProviderModelAdd({ provider }: UseProviderModelAddOptions) {
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
  const canSubmit = isModelIdValid && isEndpointTypesValid;
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
      defaultChatEndpoint: provider.defaultChatEndpoint,
      endpointConfigs: provider.endpointConfigs,
    }),
    [provider.defaultChatEndpoint, provider.endpointConfigs],
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
        group: getDefaultProviderModelGroupName(value, provider.id),
        modelId: value,
        name: value,
      }));
    },
    [provider.id],
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
      queryClient.invalidateQueries({
        queryKey: queryKeys.models.list({ providerId: provider.id }),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.models.list({ enabled: true, providerId: provider.id }),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.models.list() }),
    ]);
  }, [provider.id, queryClient]);

  const submitAddModel = useCallback(async () => {
    if (isSubmitting) {
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
    const submit = async (): Promise<boolean> => {
      const existingModels = await services.model.list({ providerId: provider.id });
      const { duplicateIds, inputs } = buildProviderModelAddInputs({
        existingModels,
        formState,
        provider,
        providerId: provider.id,
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
        // react-doctor-disable-next-line async-await-in-loop -- 每次创建的 orderKey 依赖前一条已插入的模型，并行会生成重复 key
        await services.model.createFromRegistry(input, providerConfig);
      }
      await refreshModelQueries();
      toast.show({
        label: t('settings.provider.models.addSuccess', { count: inputs.length }),
        variant: 'success',
      });
      resetForm();
      return true;
    };
    return await submit()
      .catch(() => {
        toast.show({
          label: t('settings.provider.models.addFailed'),
          variant: 'danger',
        });
        return false;
      })
      .finally(() => setIsSubmitting(false));
  }, [
    formState,
    isEndpointTypesValid,
    isModelIdValid,
    isSubmitting,
    provider,
    providerConfig,
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
