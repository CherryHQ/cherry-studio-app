import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@/frontend/data';
import type { EndpointType } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  buildProviderModelAddInputs,
  createInitialProviderModelAddFormState,
  getDefaultProviderModelGroupName,
  getProviderChatEndpointTypes,
  getProviderModelAddMode,
  getProviderModelPurposeEndpointType,
  inferProviderModelPurpose,
  providerModelAddDefaultEndpointType,
  type ProviderModelAddFormState,
  type ProviderModelChatEndpointType,
  type ProviderModelPurpose,
  splitProviderModelIds,
} from '../utils/providerModelAdd';

/**
 * Add-model form state. Takes a loaded provider because the provider decides the form's
 * shape (`modelAddMode`) and the default group name — reading those off a provider
 * that is still loading would render the form without its endpoint-type block and then
 * grow it a commit later, on top of computing the group name from `undefined`.
 */
type UseProviderModelAddOptions = {
  provider: Provider;
};

export function useProviderModelAdd({ provider }: UseProviderModelAddOptions) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const modelsQuery = useQuery('/models', { query: { providerId: provider.id } });
  const addModelsMutation = useMutation('POST', '/models', { refresh: ['/models'] });
  const addModels = addModelsMutation.trigger;
  const existingModels = modelsQuery.data;
  const refetchModels = modelsQuery.refetch;
  const modelAddMode = getProviderModelAddMode(provider);
  const chatEndpointTypes = useMemo(() => getProviderChatEndpointTypes(provider), [provider]);
  const defaultChatEndpoint = chatEndpointTypes[0] ?? providerModelAddDefaultEndpointType;
  const [formState, setFormState] = useState<ProviderModelAddFormState>(() =>
    createInitialProviderModelAddFormState(defaultChatEndpoint),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modelIdTouched, setModelIdTouched] = useState(false);
  const [endpointTypeTouched, setEndpointTypeTouched] = useState(false);

  const modelPurpose = inferProviderModelPurpose(formState.endpointTypes);
  const isDirty =
    formState.contextWindow !== '' ||
    formState.group !== '' ||
    formState.maxInputTokens !== '' ||
    formState.maxOutputTokens !== '' ||
    formState.modelId !== '' ||
    formState.name !== '' ||
    formState.endpointTypes.length !== 1 ||
    formState.endpointTypes[0] !== defaultChatEndpoint;
  const isModelIdValid = splitProviderModelIds(formState.modelId).length > 0;
  const isEndpointTypesValid =
    modelAddMode !== 'endpoint-types' || formState.endpointTypes.length > 0;
  const canSubmit = isModelIdValid && isEndpointTypesValid;
  const modelIdError =
    modelIdTouched && !isModelIdValid
      ? t('settings.provider.models.addModelIdRequired')
      : undefined;
  const endpointTypeError =
    endpointTypeTouched && !isEndpointTypesValid
      ? t('settings.provider.models.addEndpointTypeRequired')
      : undefined;

  const resetForm = useCallback(() => {
    setFormState(createInitialProviderModelAddFormState(defaultChatEndpoint));
    setModelIdTouched(false);
    setEndpointTypeTouched(false);
  }, [defaultChatEndpoint]);

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

  const updateModelPurpose = useCallback(
    (purpose: ProviderModelPurpose) => {
      setFormState((current) => ({
        ...current,
        endpointTypes: [getProviderModelPurposeEndpointType(purpose, defaultChatEndpoint)],
      }));
    },
    [defaultChatEndpoint],
  );

  const updateChatEndpointType = useCallback((endpointType: ProviderModelChatEndpointType) => {
    setFormState((current) => ({ ...current, endpointTypes: [endpointType] }));
  }, []);

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
      const currentModels = existingModels ?? (await refetchModels()).data ?? [];
      const { duplicateIds, inputs } = buildProviderModelAddInputs({
        existingModels: currentModels,
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

      await addModels({ body: inputs });
      toast.show({
        label: t('settings.provider.models.addSuccess', { count: inputs.length }),
        variant: 'success',
      });
      resetForm();
      return true;
    };
    return await submit()
      .catch(() => {
        alert.show({ title: t('settings.provider.models.addFailed') });
        return false;
      })
      .finally(() => setIsSubmitting(false));
  }, [
    alert,
    formState,
    addModels,
    existingModels,
    isEndpointTypesValid,
    isModelIdValid,
    isSubmitting,
    refetchModels,
    provider,
    resetForm,
    t,
    toast,
  ]);

  return {
    canSubmit,
    chatEndpointTypes,
    endpointTypeError,
    formState,
    isDirty,
    isSubmitting,
    modelAddMode,
    modelIdError,
    modelPurpose,
    resetForm,
    submitAddModel,
    updateChatEndpointType,
    updateContextWindow,
    updateEndpointTypes,
    updateGroup,
    updateMaxInputTokens,
    updateMaxOutputTokens,
    updateModelId,
    updateModelPurpose,
    updateName,
  };
}
