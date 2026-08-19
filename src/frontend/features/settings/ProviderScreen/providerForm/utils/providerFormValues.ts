import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import type { EndpointDraft } from '../../apiService/utils/providerApiServiceEndpointDraft';
import { createEndpointDraft } from '../../apiService/utils/providerApiServiceEndpointDraft';
import { canEditProviderEndpoint } from '../../apiService/utils/providerApiServiceEndpointRules';

/**
 * Everything the provider form edits. Creating and editing a provider fill the
 * same shape; what differs is where the starting values come from and which
 * slots a screen composes — an edit screen simply never renders the API key
 * field, so `apiKey` stays empty and is ignored on save.
 */
export type ProviderFormValues = {
  apiKey: string;
  avatarUri: string | null;
  defaultChatEndpoint: EndpointType;
  endpointUrls: Partial<Record<EndpointType, string>>;
  name: string;
};

/**
 * Endpoints a brand new provider offers, in form order. The first one is the
 * "Base URL" field; the rest go under "more endpoints".
 */
export const NEW_PROVIDER_ENDPOINT_TYPES: readonly EndpointType[] = [
  ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
  ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
  ENDPOINT_TYPE.OPENAI_RESPONSES,
  ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION,
  ENDPOINT_TYPE.OPENAI_IMAGE_EDIT,
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
 * Endpoints an existing provider offers, in form order: its default chat
 * endpoint first, then everything else it has configured or could configure.
 * Empty when the provider's auth type has no editable URLs at all (AWS, GCP,
 * OAuth), which is what makes a screen drop the endpoint slots entirely.
 */
export function resolveProviderFormEndpointTypes(provider: Provider): readonly EndpointType[] {
  return canEditProviderEndpoint(provider)
    ? createEndpointDraft(provider).visibleEndpointTypes
    : [];
}

export function createProviderFormValues({
  avatarUri,
  provider,
}: {
  avatarUri: string | null;
  provider: Provider;
}): ProviderFormValues {
  const endpointDraft = createEndpointDraft(provider);

  return {
    apiKey: '',
    avatarUri,
    defaultChatEndpoint: endpointDraft.primaryEndpoint,
    endpointUrls: endpointDraft.baseUrlByEndpoint,
    name: provider.name,
  };
}

/**
 * The form's values as the endpoint draft the save helpers take. `endpointTypes`
 * carries through as `visibleEndpointTypes` because that is the set the merge
 * treats as authoritative — an endpoint left out of it keeps whatever the
 * provider already had.
 */
export function toProviderFormEndpointDraft({
  endpointTypes,
  values,
}: {
  endpointTypes: readonly EndpointType[];
  values: ProviderFormValues;
}): EndpointDraft {
  return {
    baseUrlByEndpoint: values.endpointUrls,
    primaryEndpoint: values.defaultChatEndpoint,
    visibleEndpointTypes: [...endpointTypes],
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
