import { ENDPOINT_TYPE } from '@cherrystudio/universal/data/types/model';

import type {
  CustomProviderEndpointUrls,
  CustomProviderTextEndpoint,
} from '../apiService/utils/providerApiServiceEndpointRules';

export type CustomProviderFormValue = {
  apiKey: string;
  defaultChatEndpoint: CustomProviderTextEndpoint;
  endpointUrls: CustomProviderEndpointUrls;
  name: string;
};

export function createInitialCustomProviderFormValue(): CustomProviderFormValue {
  return {
    apiKey: '',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointUrls: {},
    name: '',
  };
}

export function isCustomProviderFormComplete(value: CustomProviderFormValue): boolean {
  return (
    value.name.trim().length > 0 &&
    Boolean(value.endpointUrls[ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]?.trim())
  );
}
