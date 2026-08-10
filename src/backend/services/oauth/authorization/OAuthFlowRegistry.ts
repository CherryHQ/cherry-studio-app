import type { OAuthFlowAdapter } from './types';

export type OAuthFlowRegistry = ReadonlyMap<string, OAuthFlowAdapter>;

export function toOAuthFlowRegistry(adapters: readonly OAuthFlowAdapter[]): OAuthFlowRegistry {
  const registry = new Map<string, OAuthFlowAdapter>();
  for (const adapter of adapters) {
    if (registry.has(adapter.providerId)) {
      throw new Error(`Duplicate OAuth adapter for ${adapter.providerId}`);
    }
    registry.set(adapter.providerId, adapter);
  }
  return registry;
}
