import { useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@/frontend/data';
import type { Provider } from '@/shared/data/types/provider';
import { deepEqual } from '@/shared/utils/deepEqual';

import {
  buildProviderModelAddInput,
  changeProviderModelPrimaryType,
  changeProviderModelEndpoint,
  createInitialProviderModelAddFormState,
  getProviderModelAddCapabilities,
  getProviderModelAddIdError,
  getProviderModelPrimaryType,
  isProviderModelImageEndpoint,
  type ProviderModelAddCapability,
  type ProviderModelAddEndpoint,
  type ProviderModelAddFormState,
  type ProviderModelPrimaryType,
} from '../utils/providerModelAdd';
import {
  buildModelPricing,
  createModelPricingDraft,
  type ModelPricingDraft,
} from '../utils/providerModelPricing';

/** Draft overrides stay local; catalog values are derived, never copied into the draft. */
export function useProviderModelAdd({ provider }: { provider: Provider }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const modelsQuery = useQuery('/models', { query: { providerId: provider.id } });
  const addModelsMutation = useMutation('POST', '/models', { refresh: ['/models'] });
  const [formState, setFormState] = useState(createInitialProviderModelAddFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [modelIdTouched, setModelIdTouched] = useState(false);
  const modelId = formState.modelId.trim();
  const modelIdError = getProviderModelAddIdError(provider.id, modelId);
  const isExisting =
    modelsQuery.data?.some((model) => model.id === `${provider.id}::${modelId}`) ?? false;
  const shouldResolve = !modelIdError && !isExisting;
  const [resolvedModelId, setResolvedModelId] = useState(modelId);
  useEffect(() => {
    const timer = setTimeout(() => setResolvedModelId(modelId), 250);
    return () => clearTimeout(timer);
  }, [modelId]);

  // This local lookup accepts one requested ID; its result may use a canonical catalog ID.
  const resolvedQuery = useQuery('/providers/:providerId/models:resolve', {
    params: { providerId: provider.id },
    query: { ids: resolvedModelId },
    enabled: shouldResolve && resolvedModelId === modelId && modelsQuery.data !== undefined,
  });
  const baseline =
    shouldResolve && resolvedModelId === modelId ? resolvedQuery.data?.[0] : undefined;
  const capabilities = getProviderModelAddCapabilities(formState, baseline);
  const primaryType = formState.primaryType ?? getProviderModelPrimaryType(capabilities, baseline);
  const pricingDraft = formState.pricing ?? createModelPricingDraft(baseline?.pricing);
  const pricingErrors = formState.pricing
    ? buildModelPricing(formState.pricing, baseline?.pricing).errors
    : [];
  const buildResult = buildProviderModelAddInput({
    existingModels: modelsQuery.data ?? [],
    formState,
    provider,
    baseline,
  });
  const isResolving = shouldResolve && (resolvedModelId !== modelId || !baseline);
  const hasLookupError = Boolean(
    modelsQuery.isError ||
    (shouldResolve &&
      resolvedModelId === modelId &&
      (resolvedQuery.isError || (resolvedQuery.data && resolvedQuery.data.length !== 1))),
  );
  const canSubmit =
    !isSubmitting &&
    !isResolving &&
    !hasLookupError &&
    modelsQuery.data !== undefined &&
    buildResult.input !== undefined;
  const isDirty = Object.entries(formState).some(([key, value]) => {
    if (key === 'endpointType') return value !== 'auto';
    if (key === 'capabilities') return Object.keys(formState.capabilities).length > 0;
    return value !== '' && value !== undefined;
  });
  const fieldErrors = Object.fromEntries(
    Object.entries(buildResult.errors).map(([field, key]) => [
      field,
      (field === 'modelId' && !modelIdTouched) || (field !== 'modelId' && isResolving)
        ? undefined
        : t(key),
    ]),
  );

  function resetForm() {
    setFormState(createInitialProviderModelAddFormState());
    setModelIdTouched(false);
  }
  function updateFormField<TField extends keyof ProviderModelAddFormState>(
    field: TField,
    value: ProviderModelAddFormState[TField],
  ) {
    setFormState((current) => ({ ...current, [field]: value }));
  }
  function updateModelId(value: string) {
    setModelIdTouched(true);
    updateFormField('modelId', value);
  }
  function updateCapability(capability: ProviderModelAddCapability, selected: boolean) {
    setFormState((current) => {
      const overrides = { ...current.capabilities };
      const inherited = getProviderModelAddCapabilities(
        createInitialProviderModelAddFormState(),
        baseline,
      )[capability];
      if (selected === inherited) delete overrides[capability];
      else overrides[capability] = selected;
      return {
        ...current,
        capabilities: overrides,
        endpointType:
          capability === 'drawing' &&
          !selected &&
          isProviderModelImageEndpoint(current.endpointType)
            ? 'auto'
            : current.endpointType,
      };
    });
  }
  function updateEndpointType(endpointType: ProviderModelAddEndpoint) {
    setFormState((current) => changeProviderModelEndpoint(current, endpointType, baseline));
  }
  function updatePrimaryType(type: ProviderModelPrimaryType) {
    setFormState((current) => changeProviderModelPrimaryType(current, type, provider, baseline));
  }
  async function retryLookup() {
    await modelsQuery.refetch();
    if (shouldResolve && resolvedModelId === modelId) await resolvedQuery.refetch();
  }

  async function submitAddModel(): Promise<boolean> {
    if (submittingRef.current) return false;
    setModelIdTouched(true);
    if (!canSubmit) return false;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const currentModels = await modelsQuery.refetch();
      if (currentModels.isError || !currentModels.data)
        throw new Error('Unable to load existing models');
      const { input } = buildProviderModelAddInput({
        existingModels: currentModels.data,
        formState,
        provider,
        baseline,
      });
      if (!input) return false;
      await addModelsMutation.trigger({ body: [input] });
      toast.show({ label: t('settings.provider.models.addSuccess'), variant: 'success' });
      resetForm();
      return true;
    } catch {
      toast.show({ label: t('settings.provider.models.addFailed'), variant: 'danger' });
      return false;
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return {
    baseline,
    canSubmit,
    capabilities,
    primaryType,
    pricingDraft,
    pricingErrors,
    fieldErrors,
    formState,
    isDirty,
    isResolving,
    isSubmitting,
    hasLookupError,
    defaultName: baseline?.name ?? modelId,
    resetForm,
    retryLookup,
    submitAddModel,
    updateCapability,
    updateEndpointType,
    updatePrimaryType,
    updateGroup: (value: string) => updateFormField('group', value),
    updatePricing: (value: ModelPricingDraft) =>
      updateFormField(
        'pricing',
        deepEqual(value, createModelPricingDraft(baseline?.pricing)) ? undefined : value,
      ),
    updateSupportsStreaming: (value: boolean) =>
      updateFormField(
        'supportsStreaming',
        value === (baseline?.supportsStreaming ?? true) ? undefined : value,
      ),
    updateModelId,
    updateContextWindow: (value: string) => updateFormField('contextWindow', value),
    updateMaxInputTokens: (value: string) => updateFormField('maxInputTokens', value),
    updateMaxOutputTokens: (value: string) => updateFormField('maxOutputTokens', value),
    updateName: (value: string) => updateFormField('name', value),
  };
}
