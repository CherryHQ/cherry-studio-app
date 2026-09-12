import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { EndpointType } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  canEditProviderEndpoint,
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES,
  getPrimaryEndpoint,
  getProviderPrimaryBaseUrl,
  isCustomProviderTextEndpointType,
  isFullyCustomProvider,
  normalizeCustomProviderDefaultEndpoint,
} from '../../../apiService/utils/providerApiServiceEndpointRules';

/**
 * Everything the provider form edits. Creating and editing a provider fill the
 * same shape; what differs is where the starting values come from and which
 * slots a screen composes.
 */
export type ProviderFormValues = {
  apiKey: string;
  avatarUri: string | null;
  defaultChatEndpoint: EndpointType;
  endpointUrls: Partial<Record<EndpointType, string>>;
  name: string;
};

/** Text protocols offered when creating a fully custom mobile provider. */
export const NEW_PROVIDER_ENDPOINT_TYPES: readonly EndpointType[] =
  CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES;

export function createEmptyProviderFormValues(): ProviderFormValues {
  return {
    apiKey: '',
    avatarUri: null,
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointUrls: {},
    name: '',
  };
}

/**
 * Fully custom providers expose every Pi text endpoint. Presets keep their
 * single primary URL. Empty means the auth type has no editable URL at all.
 */
export function resolveProviderFormEndpointTypes(provider: Provider): readonly EndpointType[] {
  if (!canEditProviderEndpoint(provider)) {
    return [];
  }

  return isFullyCustomProvider(provider)
    ? CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES
    : [getPrimaryEndpoint(provider)];
}

export function createProviderFormValues({
  apiKey = '',
  avatarUri,
  provider,
}: {
  apiKey?: string;
  avatarUri: string | null;
  provider: Provider;
}): ProviderFormValues {
  if (isFullyCustomProvider(provider)) {
    const endpointUrls = Object.fromEntries(
      CUSTOM_PROVIDER_TEXT_ENDPOINT_TYPES.map((endpointType) => [
        endpointType,
        provider.endpointConfigs?.[endpointType]?.baseUrl ?? '',
      ]),
    ) as Partial<Record<EndpointType, string>>;

    return {
      apiKey,
      avatarUri,
      defaultChatEndpoint: normalizeCustomProviderDefaultEndpoint(
        endpointUrls,
        provider.defaultChatEndpoint,
      ),
      endpointUrls,
      name: provider.name,
    };
  }

  const primaryEndpoint = getPrimaryEndpoint(provider);

  return {
    apiKey,
    avatarUri,
    defaultChatEndpoint: primaryEndpoint,
    endpointUrls: { [primaryEndpoint]: getProviderPrimaryBaseUrl(provider) },
    name: provider.name,
  };
}

export function providerDefaultEndpointNeedsRepair(provider: Provider): boolean {
  if (!isFullyCustomProvider(provider)) {
    return false;
  }

  const configuredBaseUrl = isCustomProviderTextEndpointType(provider.defaultChatEndpoint)
    ? provider.endpointConfigs?.[provider.defaultChatEndpoint]?.baseUrl?.trim()
    : undefined;
  return !configuredBaseUrl;
}

/**
 * Whether the draft still matches what it started from. Compared field by field
 * against the seeded values rather than against the provider record, so a row
 * the user typed into and cleared again counts as untouched.
 */
export function isProviderFormDirty({
  endpointTypes,
  initialValues,
  values,
}: {
  endpointTypes: readonly EndpointType[];
  initialValues: ProviderFormValues;
  values: ProviderFormValues;
}): boolean {
  if (
    values.name !== initialValues.name ||
    values.avatarUri !== initialValues.avatarUri ||
    values.apiKey !== initialValues.apiKey ||
    values.defaultChatEndpoint !== initialValues.defaultChatEndpoint
  ) {
    return true;
  }

  return endpointTypes.some(
    (endpoint) =>
      (values.endpointUrls[endpoint] ?? '') !== (initialValues.endpointUrls[endpoint] ?? ''),
  );
}
