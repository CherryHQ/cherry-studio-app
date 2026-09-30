import type { EndpointType } from '@/shared/data/types/model';
import type { ApiKeyEntry, Provider } from '@/shared/data/types/provider';

import type { ProviderConfigurationValues } from './utils/providerConfigurationValues';

export type ProviderDraftActions = {
  replaceSavedApiKeys: (apiKeys: ApiKeyEntry[]) => void;
  reset: (values?: ProviderConfigurationValues) => void;
  addApiKey: (entry: ApiKeyEntry) => void;
  updateApiKey: (id: string, updates: Partial<Omit<ApiKeyEntry, 'id'>>) => void;
  removeApiKey: (id: string) => void;
  setAvatarUri: (uri: string | null) => void;
  setDefaultChatEndpoint: (endpoint: EndpointType) => void;
  replaceTextEndpoint: (endpoint: EndpointType) => void;
  setEndpointUrl: (endpoint: EndpointType, value: string) => void;
  setName: (value: string) => void;
};

export type ProviderDraftMeta = {
  provider?: Provider;
  /** Endpoint a single-address provider edits — the first of `endpointTypes`. */
  baseUrlEndpoint: EndpointType | null;
  /**
   * Shared rules: a provider needs a name and valid key entries. Callers add their
   * own on top (creating also demands an address).
   */
  canSubmit: boolean;
  defaultEndpointNeedsRepair: boolean;
  hasEditedEndpointUrls: boolean;
  hasApiKeyChanges: boolean;
  isDirty: boolean;
  isSubmitting: boolean;
};

/** A provider that exists only on this screen until it is created. */
export type ProviderDraft = {
  actions: ProviderDraftActions;
  meta: ProviderDraftMeta;
  state: ProviderConfigurationValues;
};
