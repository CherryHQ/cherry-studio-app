import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMutation } from '@/frontend/data';
import type { UpdateModelDto } from '@/shared/data/api/schemas/models';
import { ENDPOINT_TYPE, type Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  buildModelEditPatch,
  buildModelEditSettingsPatch,
  createModelEditDraft,
  createModelEditSettings,
  type ModelEditDraft,
} from '../../../detail/model/utils/providerModelEdit';
import {
  changeProviderModelEndpoint,
  changeProviderModelPrimaryType,
  createInitialProviderModelAddFormState,
  getProviderModelAddCapabilities,
  getProviderModelAddEndpointOptions,
  getProviderModelEndpointLabelKey,
  getProviderModelPrimaryType,
  type ProviderModelAddEndpoint,
  type ProviderModelAddFormState,
} from '../../utils/providerModelAdd';
import { createModelPricingDraft } from '../../utils/providerModelPricing';
import { refreshProviderModelQueries } from '../../utils/refreshProviderModelQueries';
import type { ProviderModelLimitField, ProviderModelSettingsValue } from './types';

/**
 * A saved model, edited one change at a time. Each change is the edit screen's draft with that
 * one field changed, turned into a patch by the same builders and written immediately, so the
 * catalog-inheritance and validation rules are unchanged.
 */
export function useSavedModelSettings(
  model: Model,
  provider: Provider,
): ProviderModelSettingsValue {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mutation = useMutation('PATCH', '/models/:uniqueModelId*');
  const [pendingCount, setPendingCount] = useState(0);
  const initial = createModelEditDraft(model);
  const baseSettings = createModelEditSettings(model);
  const capabilities = getProviderModelAddCapabilities(baseSettings, model);

  async function write(patch: UpdateModelDto): Promise<string | undefined> {
    if (Object.keys(patch).length === 0) return undefined;
    setPendingCount((count) => count + 1);
    try {
      await mutation.trigger({ body: patch, params: { uniqueModelId: model.id } });
      await refreshProviderModelQueries(queryClient, provider.id);
      return undefined;
    } catch {
      const message = t('settings.provider.models.detail.saveFailed');
      toast.show({ label: message, variant: 'danger' });
      return message;
    } finally {
      setPendingCount((count) => count - 1);
    }
  }

  function writeDraft(field: keyof ModelEditDraft, value: string): Promise<string | undefined> {
    const patch = buildModelEditPatch(initial, { ...initial, [field]: value });
    if (!patch) {
      return Promise.resolve(
        t(
          field === 'name'
            ? 'settings.provider.models.form.nameRequired'
            : 'settings.provider.models.form.invalidLimits',
        ),
      );
    }
    return write(patch);
  }

  async function writeSettings(settings: ProviderModelAddFormState): Promise<string | undefined> {
    const result = buildModelEditSettingsPatch(model, provider, settings);
    if (!result.patch) {
      const message = t(result.error ?? 'settings.provider.models.detail.saveFailed');
      alert.show({ title: message });
      return message;
    }
    return write(result.patch);
  }

  const endpointOptions: { label: string; value: ProviderModelAddEndpoint }[] = [
    { label: t('settings.provider.models.addEndpointAuto'), value: 'auto' },
    ...getProviderModelAddEndpointOptions(provider).map(({ id, labelKey }) => ({
      label: t(labelKey),
      value: id,
    })),
  ];
  if (
    baseSettings.endpointType !== 'auto' &&
    !endpointOptions.some((option) => option.value === baseSettings.endpointType)
  ) {
    endpointOptions.push({
      label: t(getProviderModelEndpointLabelKey(baseSettings.endpointType)),
      value: baseSettings.endpointType,
    });
  }

  const limitSetting = (field: ProviderModelLimitField) => ({
    placeholder: t('settings.provider.models.detail.useDefault'),
    value: initial[field],
  });

  return {
    actions: {
      rename: (name) => writeDraft('name', name),
      setCapability: (capability, selected) => {
        const inherited = getProviderModelAddCapabilities(
          createInitialProviderModelAddFormState(),
          model,
        )[capability];
        const overrides = { ...baseSettings.capabilities };
        if (selected === inherited) delete overrides[capability];
        else overrides[capability] = selected;
        void writeSettings({ ...baseSettings, capabilities: overrides });
      },
      setEndpoint: (endpoint) =>
        void writeSettings(changeProviderModelEndpoint(baseSettings, endpoint, model)),
      setGroup: (group) => writeDraft('group', group),
      setLimit: (field, value) => writeDraft(field, value),
      setNotes: (notes) => writeDraft('notes', notes),
      setPricing: (pricing) => writeSettings({ ...baseSettings, pricing }),
      setPrimaryType: (type) =>
        void writeSettings(changeProviderModelPrimaryType(baseSettings, type, provider, model)),
      setSupportsStreaming: (value) =>
        void writeSettings({
          ...baseSettings,
          supportsStreaming: value === model.supportsStreaming ? undefined : value,
        }),
    },
    capabilities,
    disabled: pendingCount > 0,
    endpoint: {
      label:
        endpointOptions.find((option) => option.value === baseSettings.endpointType)?.label ??
        t('settings.provider.models.endpoint.unavailable'),
      options: endpointOptions,
      value: baseSettings.endpointType,
    },
    group: { value: initial.group },
    limits: capabilities.drawing
      ? undefined
      : {
          contextWindow: limitSetting('contextWindow'),
          maxInputTokens: limitSetting('maxInputTokens'),
          maxOutputTokens: limitSetting('maxOutputTokens'),
        },
    name: { required: true, value: initial.name },
    notes: { value: initial.notes },
    primaryType: getProviderModelPrimaryType(capabilities, model),
    pricing: createModelPricingDraft(model.pricing),
    requiresImageInput: Boolean(model.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT)),
    supportsStreaming: model.supportsStreaming,
  };
}
