import { useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@/frontend/data';
import { MODELS_BATCH_MAX_ITEMS } from '@/shared/data/api/schemas/models';
import type { Provider } from '@/shared/data/types/provider';

import {
  buildProviderModelAddInputs,
  createInitialProviderModelAddFormState,
  getDefaultProviderModelGroupName,
  getProviderModelAddCapabilities,
  isProviderModelAddIdValid,
  isProviderModelImageEndpoint,
  type ProviderModelAddCapability,
  type ProviderModelAddEndpoint,
  type ProviderModelAddFormState,
  splitProviderModelIds,
} from '../utils/providerModelAdd';

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
  const modelIds = splitProviderModelIds(formState.modelId);
  const isBatchAdd = modelIds.length > 1;
  const existingIds = new Set<string>(modelsQuery.data?.map((model) => model.id));
  const pendingIds = [...new Set(modelIds)].filter(
    (id) => !existingIds.has(`${provider.id}::${id}`) && isProviderModelAddIdValid(provider.id, id),
  );
  const idsKey = JSON.stringify(pendingIds.length <= MODELS_BATCH_MAX_ITEMS ? pendingIds : []);
  const [resolvedIdsKey, setResolvedIdsKey] = useState(idsKey);
  useEffect(() => {
    const timer = setTimeout(() => setResolvedIdsKey(idsKey), 250);
    return () => clearTimeout(timer);
  }, [idsKey]);

  // This is the local registry API, not a provider catalog fetch or a connectivity probe.
  const requestedIds = JSON.parse(resolvedIdsKey) as string[];
  const resolvedQuery = useQuery('/providers/:providerId/models:resolve', {
    params: { providerId: provider.id },
    query: { ids: requestedIds },
    enabled:
      resolvedIdsKey === idsKey &&
      pendingIds.length > 0 &&
      pendingIds.length <= MODELS_BATCH_MAX_ITEMS &&
      modelsQuery.data !== undefined,
  });
  // The resolver preserves request order, but modelId can be a canonical catalog ID.
  // Associate each baseline with its requested ID, including aliases sharing one catalog model.
  const resolvedModels =
    resolvedIdsKey === idsKey && resolvedQuery.data?.length === requestedIds.length
      ? resolvedQuery.data.map((model, index) => ({ ...model, modelId: requestedIds[index]! }))
      : undefined;
  const baseline = !isBatchAdd
    ? resolvedModels?.find((model) => model.modelId === modelIds[0])
    : undefined;
  const capabilities = getProviderModelAddCapabilities(formState, baseline, isBatchAdd);
  const buildResult = buildProviderModelAddInputs({
    existingModels: modelsQuery.data ?? [],
    formState,
    provider,
    resolvedModels: resolvedModels ?? [],
  });
  const isResolving =
    pendingIds.length > 0 &&
    pendingIds.length <= MODELS_BATCH_MAX_ITEMS &&
    (resolvedIdsKey !== idsKey || !resolvedModels);
  const hasLookupError = Boolean(
    modelsQuery.isError ||
    (resolvedIdsKey === idsKey &&
      (resolvedQuery.isError ||
        (resolvedQuery.data && resolvedQuery.data.length !== requestedIds.length))),
  );
  const canSubmit =
    !isSubmitting &&
    !isResolving &&
    !hasLookupError &&
    modelsQuery.data !== undefined &&
    Object.keys(buildResult.errors).length === 0 &&
    buildResult.inputs.length > 0;
  const isDirty = Object.entries(formState).some(([key, value]) => {
    if (key === 'endpointType') return value !== 'auto';
    if (key === 'capabilities') return Object.keys(formState.capabilities).length > 0;
    return value !== '';
  });
  const fieldErrors = Object.fromEntries(
    Object.entries(buildResult.errors).map(([field, key]) => [
      field,
      (field === 'modelId' && !modelIdTouched) || (field !== 'modelId' && isResolving)
        ? undefined
        : t(key, {
            ids: (field === 'endpointType'
              ? buildResult.endpointErrorIds
              : buildResult.invalidIds
            ).join(', '),
          }),
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
      if (isBatchAdd ? !selected : selected === inherited) delete overrides[capability];
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
    setFormState((current) => {
      const overrides = { ...current.capabilities };
      if (isProviderModelImageEndpoint(endpointType)) delete overrides.drawing;
      return { ...current, endpointType, capabilities: overrides };
    });
  }
  async function retryLookup() {
    await modelsQuery.refetch();
    if (
      resolvedIdsKey === idsKey &&
      pendingIds.length > 0 &&
      pendingIds.length <= MODELS_BATCH_MAX_ITEMS
    )
      await resolvedQuery.refetch();
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
      const { duplicateIds, inputs, errors } = buildProviderModelAddInputs({
        existingModels: currentModels.data,
        formState,
        provider,
        resolvedModels: resolvedModels ?? [],
      });
      // A concurrent deletion can turn a previously skipped duplicate into an unresolved input.
      if (inputs.some((input) => !resolvedModels?.some((model) => model.modelId === input.modelId)))
        return false;
      if (duplicateIds.length > 0)
        toast.show({
          label: t('settings.provider.models.addDuplicate', { ids: duplicateIds.join(', ') }),
          variant: 'warning',
        });
      if (Object.keys(errors).length > 0 || inputs.length === 0) return false;
      await addModelsMutation.trigger({ body: inputs });
      toast.show({
        label: t('settings.provider.models.addSuccess', { count: inputs.length }),
        variant: 'success',
      });
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
    buildResult,
    canSubmit,
    capabilities,
    fieldErrors,
    formState,
    isBatchAdd,
    isDirty,
    isResolving,
    isSubmitting,
    hasLookupError,
    defaultName: baseline?.name ?? modelIds[0] ?? '',
    defaultGroup:
      baseline?.group ??
      (baseline?.presetModelId
        ? ''
        : getDefaultProviderModelGroupName(modelIds[0] ?? '', provider.id)),
    resetForm,
    retryLookup,
    submitAddModel,
    updateCapability,
    updateEndpointType,
    updateModelId,
    updateContextWindow: (value: string) => updateFormField('contextWindow', value),
    updateGroup: (value: string) => updateFormField('group', value),
    updateMaxInputTokens: (value: string) => updateFormField('maxInputTokens', value),
    updateMaxOutputTokens: (value: string) => updateFormField('maxOutputTokens', value),
    updateName: (value: string) => updateFormField('name', value),
  };
}
