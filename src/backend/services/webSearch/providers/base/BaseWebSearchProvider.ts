import type { WebSearchCapability, WebSearchProvider } from '@/shared/data/types/webSearch';

import type { ApiKeyRotationState } from '../../utils/provider';
import { assertProviderReady } from '../../utils/provider';

export abstract class BaseWebSearchProvider {
  constructor(
    protected readonly provider: WebSearchProvider,
    private readonly apiKeyRotationState: ApiKeyRotationState,
  ) {}

  /** Configuration-only check: never consumes a key or makes a network request. */
  validateConfiguration(capability: WebSearchCapability): void {
    assertProviderReady(this.provider, capability);
  }

  protected resolveApiKey(required = true): string {
    return this.apiKeyRotationState.resolve(this.provider, required);
  }
}
