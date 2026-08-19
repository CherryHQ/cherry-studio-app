import type { EndpointType } from '@cherrystudio/universal/data/types/model';
import { createContext, use } from 'react';

import type { ProviderFormValues } from './utils/providerFormValues';

export type ProviderFormActions = {
  setApiKey: (value: string) => void;
  setAvatarUri: (uri: string | null) => void;
  setDefaultChatEndpoint: (endpoint: EndpointType) => void;
  setEndpointUrl: (endpoint: EndpointType, value: string) => void;
  setName: (value: string) => void;
};

export type ProviderFormMeta = {
  /** Endpoint the "Base URL" field edits — the first of `endpointTypes`. */
  baseUrlEndpoint: EndpointType | null;
  /**
   * The one rule both screens share: a provider needs a name. Screens add their
   * own on top (creating also demands a Base URL) rather than the form growing a
   * flag per screen.
   */
  canSubmit: boolean;
  endpointTypes: readonly EndpointType[];
  isDirty: boolean;
  isSubmitting: boolean;
  /** Everything under "more endpoints" — `endpointTypes` minus the Base URL one. */
  secondaryEndpointTypes: readonly EndpointType[];
};

export type ProviderForm = {
  actions: ProviderFormActions;
  meta: ProviderFormMeta;
  state: ProviderFormValues;
};

export const ProviderFormContext = createContext<ProviderForm | null>(null);

export function useProviderForm(part: string): ProviderForm {
  const context = use(ProviderFormContext);

  if (!context) {
    throw new Error(`${part} must be rendered inside a ProviderForm`);
  }

  return context;
}
