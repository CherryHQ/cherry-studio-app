import type { ProvidersBackend } from '@/shared/contracts';
import type {
  CreateProviderInput,
  UpdateProviderApiKeyInput,
  UpdateProviderInput,
} from '@cherrystudio/universal/data/api/schemas/providers';
import type {
  ApiKeyEntry,
  AuthConfig,
  Provider,
} from '@cherrystudio/universal/data/types/provider';

type ProviderRepository = {
  canRemove(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean;
  create(input: CreateProviderInput): Promise<Provider>;
  get(id: string): Promise<Provider>;
  getAuth(id: string): Promise<AuthConfig | null>;
  list(query?: { enabled?: boolean }): Promise<Provider[]>;
  listApiKeys(id: string, query?: { enabled?: boolean }): Promise<ApiKeyEntry[]>;
  remove(id: string): Promise<void>;
  replaceApiKeys(id: string, apiKeys: ApiKeyEntry[]): Promise<Provider>;
  update(id: string, input: UpdateProviderInput): Promise<Provider>;
  updateApiKey(id: string, keyId: string, input: UpdateProviderApiKeyInput): Promise<Provider>;
};

type ProviderAvatarStorage = {
  persist(providerId: string, sourceUri: string): Promise<string>;
  resolve(providerId: string): string | undefined;
};

export type ProvidersServiceDependencies = {
  avatars: ProviderAvatarStorage;
  providers: ProviderRepository;
};

export class ProvidersService implements ProvidersBackend {
  constructor(private readonly dependencies: ProvidersServiceDependencies) {}

  canRemove(provider: Pick<Provider, 'id' | 'presetProviderId'>): boolean {
    return this.dependencies.providers.canRemove(provider);
  }

  create(input: CreateProviderInput): Promise<Provider> {
    return this.dependencies.providers.create(input);
  }

  get(id: string): Promise<Provider> {
    return this.dependencies.providers.get(id);
  }

  getAuth(id: string): Promise<AuthConfig | null> {
    return this.dependencies.providers.getAuth(id);
  }

  list(query?: { enabled?: boolean }): Promise<Provider[]> {
    return this.dependencies.providers.list(query);
  }

  listApiKeys(id: string, query?: { enabled?: boolean }): Promise<ApiKeyEntry[]> {
    return this.dependencies.providers.listApiKeys(id, query);
  }

  persistAvatar(id: string, sourceUri: string): Promise<string> {
    return this.dependencies.avatars.persist(id, sourceUri);
  }

  remove(id: string): Promise<void> {
    return this.dependencies.providers.remove(id);
  }

  replaceApiKeys(id: string, apiKeys: ApiKeyEntry[]): Promise<Provider> {
    return this.dependencies.providers.replaceApiKeys(id, apiKeys);
  }

  resolveAvatar(id: string): string | undefined {
    return this.dependencies.avatars.resolve(id);
  }

  update(id: string, input: UpdateProviderInput): Promise<Provider> {
    return this.dependencies.providers.update(id, input);
  }

  updateApiKey(id: string, keyId: string, input: UpdateProviderApiKeyInput): Promise<Provider> {
    return this.dependencies.providers.updateApiKey(id, keyId, input);
  }
}
