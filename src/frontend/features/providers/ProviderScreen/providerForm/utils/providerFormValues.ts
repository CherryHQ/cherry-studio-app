import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { EndpointType } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  canEditProviderEndpoint,
  getPrimaryEndpoint,
  getProviderPrimaryBaseUrl,
} from '../../apiService/utils/providerApiServiceEndpointRules';

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

/**
 * New mobile providers expose one standard endpoint through the Base URL field.
 */
export const NEW_PROVIDER_ENDPOINT_TYPES: readonly EndpointType[] = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
];

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
 * Existing mobile providers expose only their current primary endpoint.
 * Empty when the provider's auth type has no editable URLs at all (AWS, GCP),
 * which is what makes a screen drop the endpoint slots entirely.
 */
export function resolveProviderFormEndpointTypes(provider: Provider): readonly EndpointType[] {
  return canEditProviderEndpoint(provider) ? [getPrimaryEndpoint(provider)] : [];
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
  const primaryEndpoint = getPrimaryEndpoint(provider);

  return {
    apiKey,
    avatarUri,
    defaultChatEndpoint: primaryEndpoint,
    endpointUrls: { [primaryEndpoint]: getProviderPrimaryBaseUrl(provider) },
    name: provider.name,
  };
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
