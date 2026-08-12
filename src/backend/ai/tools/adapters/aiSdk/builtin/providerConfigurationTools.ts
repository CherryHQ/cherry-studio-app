import {
  CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME,
  configureBuiltinProviderInputSchema,
  CREATE_CUSTOM_PROVIDER_TOOL_NAME,
  createCustomProviderInputSchema,
  providerConfigurationToolOutputSchema,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import { tool } from 'ai';

import type { ProviderSetupModule } from '@/shared/contracts';

import type { ToolEntry } from '../../../types';

const PROVIDER_CONFIGURATION_NAMESPACE = 'provider-configuration';

export function createProviderConfigurationToolEntries(
  providerSetup: Pick<ProviderSetupModule, 'executeBuiltin' | 'executeCustom' | 'resolveBuiltin'>,
): ToolEntry[] {
  return [
    {
      applies: (scope) => scope.providerConfigurationEnabled,
      defer: 'never',
      description:
        'Configure credentials, endpoint, or models for an existing built-in provider. Ask for a provider when the result requests one.',
      name: CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME,
      namespace: PROVIDER_CONFIGURATION_NAMESPACE,
      tool: tool({
        description:
          'Configure an existing built-in provider, pull its model catalog, or add model drafts.',
        inputSchema: configureBuiltinProviderInputSchema,
        outputSchema: providerConfigurationToolOutputSchema,
        strict: true,
        metadata: {
          cherry: {
            tool: { name: CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME, type: 'provider' },
          },
        },
        needsApproval: async ({ provider }) =>
          (await providerSetup.resolveBuiltin(provider)).status === 'matched',
        execute: (input, options) => providerSetup.executeBuiltin(input, options.abortSignal),
      }),
    },
    {
      applies: (scope) => scope.providerConfigurationEnabled,
      defer: 'never',
      description: 'Create and configure a new custom API provider after user review.',
      name: CREATE_CUSTOM_PROVIDER_TOOL_NAME,
      namespace: PROVIDER_CONFIGURATION_NAMESPACE,
      tool: tool({
        description:
          'Create a custom provider with a user-supplied name, API key, endpoints, and models.',
        inputSchema: createCustomProviderInputSchema,
        outputSchema: providerConfigurationToolOutputSchema,
        strict: true,
        metadata: {
          cherry: { tool: { name: CREATE_CUSTOM_PROVIDER_TOOL_NAME, type: 'provider' } },
        },
        needsApproval: true,
        execute: (input, options) => providerSetup.executeCustom(input, options.abortSignal),
      }),
    },
  ];
}
