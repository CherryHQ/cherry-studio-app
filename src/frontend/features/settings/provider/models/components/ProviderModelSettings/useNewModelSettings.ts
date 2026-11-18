import { useTranslation } from 'react-i18next';

import { ENDPOINT_TYPE } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import type { useProviderModelAdd } from '../../hooks/useProviderModelAdd';
import {
  getDefaultProviderModelGroupName,
  getProviderModelAddEndpointOptions,
  getProviderModelEndpointLabelKey,
} from '../../utils/providerModelAdd';
import type { ProviderModelLimitField, ProviderModelSettingsValue } from './types';

/**
 * The model being added, exposed as the same settings a saved model shows. Changes apply to
 * the add draft; catalog values found for the model ID appear as placeholders.
 */
export function useNewModelSettings(
  add: ReturnType<typeof useProviderModelAdd>,
  provider: Provider,
): ProviderModelSettingsValue {
  const { t } = useTranslation();
  const { baseline, formState } = add;
  const disabled = add.isSubmitting || add.isResolving || add.hasLookupError;
  const endpointOptions = [
    { label: t('settings.provider.models.addEndpointAuto'), value: 'auto' as const },
    ...getProviderModelAddEndpointOptions(provider).map(({ id, labelKey }) => ({
      label: t(labelKey),
      value: id,
    })),
  ];
  const limitSetting = (field: ProviderModelLimitField) => ({
    error: add.fieldErrors[field],
    placeholder: baseline?.[field]?.toString() ?? t('settings.provider.models.detail.useDefault'),
    value: formState[field],
  });
  const setLimit = {
    contextWindow: add.updateContextWindow,
    maxInputTokens: add.updateMaxInputTokens,
    maxOutputTokens: add.updateMaxOutputTokens,
  } satisfies Record<ProviderModelLimitField, (value: string) => void>;

  return {
    actions: {
      rename: async (name) => {
        add.updateName(name.trim());
        return undefined;
      },
      setCapability: add.updateCapability,
      setEndpoint: add.updateEndpointType,
      setGroup: async (group) => {
        add.updateGroup(group.trim());
        return undefined;
      },
      setLimit: async (field, value) => {
        setLimit[field](value.trim());
        return undefined;
      },
      setPricing: async (pricing) => {
        add.updatePricing(pricing);
        return undefined;
      },
      setPrimaryType: add.updatePrimaryType,
      setSupportsStreaming: add.updateSupportsStreaming,
    },
    capabilities: add.capabilities,
    disabled,
    endpoint: {
      disabled: add.isSubmitting || endpointOptions.length === 1,
      error: add.fieldErrors.endpointType,
      label:
        formState.endpointType === 'auto'
          ? t('settings.provider.models.addEndpointAuto')
          : t(getProviderModelEndpointLabelKey(formState.endpointType)),
      options: endpointOptions,
      value: formState.endpointType,
    },
    group: {
      placeholder:
        baseline?.group ?? getDefaultProviderModelGroupName(formState.modelId, provider.id),
      value: formState.group,
    },
    limits: add.capabilities.drawing
      ? undefined
      : {
          contextWindow: limitSetting('contextWindow'),
          maxInputTokens: limitSetting('maxInputTokens'),
          maxOutputTokens: limitSetting('maxOutputTokens'),
        },
    name: {
      placeholder: add.defaultName || t('settings.provider.models.addModelNamePlaceholder'),
      required: false,
      value: formState.name,
    },
    primaryType: add.primaryType,
    pricing: add.pricingDraft,
    requiresImageInput: Boolean(
      formState.endpointType === 'auto'
        ? baseline?.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT)
        : formState.endpointType === ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
    ),
    supportsStreaming: formState.supportsStreaming ?? baseline?.supportsStreaming ?? true,
  };
}
