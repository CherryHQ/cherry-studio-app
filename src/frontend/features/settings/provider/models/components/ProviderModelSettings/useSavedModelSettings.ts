import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { queryKeys, useMutation } from '@/frontend/data';
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
  type ProviderModelAddCapability,
  type ProviderModelAddEndpoint,
  type ProviderModelAddFormState,
} from '../../utils/providerModelAdd';
import { createModelPricingDraft } from '../../utils/providerModelPricing';
import { refreshProviderModelQueries } from '../../utils/refreshProviderModelQueries';
import type { ProviderModelLimitField, ProviderModelSettingsValue } from './types';

type SwitchField = ProviderModelAddCapability | 'supportsStreaming';

/**
 * A saved model, edited one change at a time. Each change is the edit screen's draft with that
 * one field changed, turned into a patch by the same builders and written immediately, so the
 * catalog-inheritance and validation rules are unchanged.
 *
 * The page never locks while writing. Changes are written in order, each built from the model
 * the previous write returned, and that model goes straight into the detail query; a switch
 * shows its new position until its write settles.
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
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const switchWrites = useRef(0);
  const [switching, setSwitching] = useState<
    Partial<Record<SwitchField, { value: boolean; write: number }>>
  >({});
  const initial = createModelEditDraft(model);
  const baseSettings = createModelEditSettings(model);
  const capabilities = {
    ...getProviderModelAddCapabilities(baseSettings, model),
    ...Object.fromEntries(
      Object.entries(switching)
        .filter(([field]) => field !== 'supportsStreaming')
        .map(([field, pending]) => [field, pending.value]),
    ),
  };

  const latestModel = () =>
    queryClient.getQueryData<Model>(queryKeys.models.detail(model.id)) ?? model;

  /** Queues a change; `build` runs once earlier changes are written, against the latest model. */
  function write(
    build: (latest: Model) => { error?: string; patch?: UpdateModelDto },
  ): Promise<string | undefined> {
    const run = async (): Promise<string | undefined> => {
      const { error, patch } = build(latestModel());
      if (error) return error;
      if (!patch || Object.keys(patch).length === 0) return undefined;
      try {
        const saved = await mutation.trigger({ body: patch, params: { uniqueModelId: model.id } });
        queryClient.setQueryData(queryKeys.models.detail(model.id), saved);
        void refreshProviderModelQueries(queryClient, provider.id);
        return undefined;
      } catch {
        const message = t('settings.provider.models.detail.saveFailed');
        toast.show({ label: message, variant: 'danger' });
        return message;
      }
    };
    const result = queue.current.then(run);
    queue.current = result.catch(() => undefined);
    return result;
  }

  function writeDraft(field: keyof ModelEditDraft, value: string): Promise<string | undefined> {
    return write((latest) => {
      const draft = createModelEditDraft(latest);
      const patch = buildModelEditPatch(draft, { ...draft, [field]: value });
      if (patch) return { patch };
      return {
        error: t(
          field === 'name'
            ? 'settings.provider.models.form.nameRequired'
            : 'settings.provider.models.form.invalidLimits',
        ),
      };
    });
  }

  function writeSettings(
    change: (settings: ProviderModelAddFormState, latest: Model) => ProviderModelAddFormState,
  ): Promise<string | undefined> {
    return write((latest) => {
      const result = buildModelEditSettingsPatch(
        latest,
        provider,
        change(createModelEditSettings(latest), latest),
      );
      if (result.patch) return { patch: result.patch };
      const message = t(result.error ?? 'settings.provider.models.detail.saveFailed');
      alert.show({ title: message });
      return { error: message };
    });
  }

  /** Shows the switch's new position until its write settles, then the saved model decides. */
  function writeSwitch(
    field: SwitchField,
    value: boolean,
    change: (settings: ProviderModelAddFormState, latest: Model) => ProviderModelAddFormState,
  ) {
    const id = ++switchWrites.current;
    setSwitching((current) => ({ ...current, [field]: { value, write: id } }));
    void writeSettings(change).finally(() =>
      setSwitching((current) => {
        if (current[field]?.write !== id) return current;
        const { [field]: _settled, ...rest } = current;
        return rest;
      }),
    );
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
      setCapability: (capability, selected) =>
        writeSwitch(capability, selected, (settings, latest) => {
          const inherited = getProviderModelAddCapabilities(
            createInitialProviderModelAddFormState(),
            latest,
          )[capability];
          const overrides = { ...settings.capabilities };
          if (selected === inherited) delete overrides[capability];
          else overrides[capability] = selected;
          return { ...settings, capabilities: overrides };
        }),
      setEndpoint: (endpoint) =>
        void writeSettings((settings, latest) =>
          changeProviderModelEndpoint(settings, endpoint, latest),
        ),
      setGroup: (group) => writeDraft('group', group),
      setLimit: (field, value) => writeDraft(field, value),
      setNotes: (notes) => writeDraft('notes', notes),
      setPricing: (pricing) => writeSettings((settings) => ({ ...settings, pricing })),
      setPrimaryType: (type) =>
        void writeSettings((settings, latest) =>
          changeProviderModelPrimaryType(settings, type, provider, latest),
        ),
      setSupportsStreaming: (value) =>
        writeSwitch('supportsStreaming', value, (settings, latest) => ({
          ...settings,
          supportsStreaming: value === latest.supportsStreaming ? undefined : value,
        })),
    },
    capabilities,
    disabled: false,
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
    modelId: model.modelId,
    name: { required: true, value: initial.name },
    notes: { value: initial.notes },
    primaryType: getProviderModelPrimaryType(capabilities, model),
    pricing: createModelPricingDraft(model.pricing),
    requiresImageInput: Boolean(model.endpointTypes?.includes(ENDPOINT_TYPE.OPENAI_IMAGE_EDIT)),
    supportsStreaming: switching.supportsStreaming?.value ?? model.supportsStreaming,
  };
}
