import type { TFunction } from 'i18next';

import type { EndpointType, Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';

import {
  getProviderChatEndpointTypes,
  getProviderModelEndpointLabelKey,
  type ProviderModelChatEndpointType,
  PROVIDER_MODEL_CHAT_ENDPOINT_TYPES,
} from './providerModelAdd';

export const PROVIDER_DEFAULT_ENDPOINT_SELECTION = 'provider-default';

export type ProviderModelEndpointSelection =
  | typeof PROVIDER_DEFAULT_ENDPOINT_SELECTION
  | EndpointType;

export function getProviderModelEndpointOptions(
  provider: Provider,
  t: TFunction,
): { label: string; value: ProviderModelEndpointSelection }[] {
  const defaultEndpoint = provider.defaultChatEndpoint
    ? t(getProviderModelEndpointLabelKey(provider.defaultChatEndpoint))
    : t('settings.provider.models.endpoint.unavailable');
  return [
    {
      label: t('settings.provider.models.endpoint.followDefault', { endpoint: defaultEndpoint }),
      value: PROVIDER_DEFAULT_ENDPOINT_SELECTION,
    },
    ...getProviderChatEndpointTypes(provider).map((value) => ({
      label: t(getProviderModelEndpointLabelKey(value)),
      value,
    })),
  ];
}

export type ProviderModelEndpointState =
  | { endpointType: ProviderModelChatEndpointType; kind: 'default' | 'explicit' }
  | { endpointType?: EndpointType; kind: 'unavailable' }
  | { endpointType: EndpointType; kind: 'unsupported' };

export function getProviderModelEndpointState(
  provider: Provider,
  model: Pick<Model, 'endpointTypes'>,
): ProviderModelEndpointState {
  const configuredEndpointTypes = getProviderChatEndpointTypes(provider);
  const explicitEndpointType = model.endpointTypes?.[0];

  if (explicitEndpointType) {
    if (!isProviderModelChatEndpoint(explicitEndpointType)) {
      return { endpointType: explicitEndpointType, kind: 'unsupported' };
    }
    return configuredEndpointTypes.includes(explicitEndpointType)
      ? { endpointType: explicitEndpointType, kind: 'explicit' }
      : { endpointType: explicitEndpointType, kind: 'unavailable' };
  }

  return provider.defaultChatEndpoint &&
    isProviderModelChatEndpoint(provider.defaultChatEndpoint) &&
    configuredEndpointTypes.includes(provider.defaultChatEndpoint)
    ? { endpointType: provider.defaultChatEndpoint, kind: 'default' }
    : { endpointType: provider.defaultChatEndpoint, kind: 'unavailable' };
}

export function getProviderModelEndpointSelection(
  model: Pick<Model, 'endpointTypes'>,
): ProviderModelEndpointSelection {
  return model.endpointTypes?.[0] ?? PROVIDER_DEFAULT_ENDPOINT_SELECTION;
}

export function shouldShowProviderModelEndpointPicker({
  model,
  provider,
}: {
  model: Model;
  provider: Provider;
}): boolean {
  if (provider.presetProviderId != null || !isTextGenerationModel(model)) {
    return false;
  }

  const state = getProviderModelEndpointState(provider, model);
  return (
    getProviderChatEndpointTypes(provider).length >= 2 ||
    state.kind === 'unavailable' ||
    state.kind === 'unsupported'
  );
}

function isProviderModelChatEndpoint(
  endpointType: EndpointType,
): endpointType is ProviderModelChatEndpointType {
  return PROVIDER_MODEL_CHAT_ENDPOINT_TYPES.some((candidate) => candidate === endpointType);
}
