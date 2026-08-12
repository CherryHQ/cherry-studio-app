import type {
  ConfigureBuiltinProviderInput,
  CreateCustomProviderInput,
  ProviderConfigurationSummary,
  ProviderConfigurationToolOutput,
} from '@cherrystudio/universal/ai/providerConfigurationTools';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

export type ProviderSetupMatchedProvider = {
  apiKeyCount: number;
  canEditEndpoint: boolean;
  origin: string;
  provider: Provider;
  status: 'matched';
};

export type ProviderSetupResolveResult =
  | ProviderSetupMatchedProvider
  | Exclude<ProviderConfigurationToolOutput, ProviderConfigurationSummary>;

export type ProviderSetupPreview = ProviderSetupMatchedProvider & {
  apiKeyWillBeAdded: boolean;
  catalogError?: string;
  catalogSource: 'api' | 'registry' | 'skipped';
  defaultSelectedModelIds: UniqueModelId[];
  models: {
    added: Model[];
    missing: Model[];
  };
  remotelyProbed: boolean;
};

export interface ProviderSetupModule {
  executeBuiltin(
    input: ConfigureBuiltinProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderConfigurationToolOutput>;
  executeCustom(
    input: CreateCustomProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderConfigurationToolOutput>;
  previewBuiltin(
    input: ConfigureBuiltinProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderSetupPreview>;
  previewCustom(
    input: CreateCustomProviderInput,
    signal?: AbortSignal,
  ): Promise<ProviderSetupPreview>;
  resolveBuiltin(query: string): Promise<ProviderSetupResolveResult>;
}
