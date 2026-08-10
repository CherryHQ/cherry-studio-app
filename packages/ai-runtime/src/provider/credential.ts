import type { ServingCredentialReceipt as UniversalServingCredentialReceipt } from '@cherrystudio/universal/data/types/aiUsageRecord';

export type ServingAuthMethod = Extract<
  UniversalServingCredentialReceipt,
  { attribution: 'auth' }
>['method'];

/**
 * Non-secret receipt for the credential path selected by provider configuration.
 *
 * API-key identity comes from ProviderService's atomic selection. Provider-level
 * authentication is declared by the config builder that installs it. Unknown is
 * used whenever the request owner cannot prove which credential served.
 */
export type ServingCredentialReceipt = UniversalServingCredentialReceipt;
