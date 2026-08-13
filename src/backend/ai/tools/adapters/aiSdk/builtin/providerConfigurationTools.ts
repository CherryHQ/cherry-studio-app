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
const CONFIGURE_BUILTIN_PROVIDER_DESCRIPTION =
  'Call immediately to configure or update a built-in provider (OpenAI, Gemini, CherryIN), or pull, sync, add, or manage models. If provider, key, or URL is missing, pass empty values; the tool handles clarification. For a new provider use create_custom_provider.';
const CREATE_CUSTOM_PROVIDER_DESCRIPTION =
  'Call immediately only to create or add a new provider. If name, key, or URL is missing, pass empty values. For built-in provider configuration, updates, or models use configure_builtin_provider.';

export function createProviderConfigurationToolEntries(
  providerSetup: Pick<ProviderSetupModule, 'executeBuiltin' | 'executeCustom' | 'resolveBuiltin'>,
): ToolEntry[] {
  return [
    {
      applies: (scope) => scope.providerConfigurationEnabled,
      defer: 'never',
      description: CONFIGURE_BUILTIN_PROVIDER_DESCRIPTION,
      name: CONFIGURE_BUILTIN_PROVIDER_TOOL_NAME,
      namespace: PROVIDER_CONFIGURATION_NAMESPACE,
      tool: tool({
        description: CONFIGURE_BUILTIN_PROVIDER_DESCRIPTION,
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
      description: CREATE_CUSTOM_PROVIDER_DESCRIPTION,
      name: CREATE_CUSTOM_PROVIDER_TOOL_NAME,
      namespace: PROVIDER_CONFIGURATION_NAMESPACE,
      tool: tool({
        description: CREATE_CUSTOM_PROVIDER_DESCRIPTION,
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
