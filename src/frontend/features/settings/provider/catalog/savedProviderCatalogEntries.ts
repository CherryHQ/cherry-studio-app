import type { ProviderCatalogEntry } from '@/shared/contracts';
import type { Provider } from '@/shared/data/types/provider';

/** Saved presets outside the regional catalog remain available beside custom connections. */
export function getSavedProviderCatalogEntries(
  providers: readonly Provider[],
  catalog: readonly ProviderCatalogEntry[],
  query: string,
): Provider[] {
  const catalogIds = new Set(catalog.map((provider) => provider.id));
  const search = query.toLowerCase();
  return providers.filter(
    (provider) =>
      (!provider.presetProviderId || !catalogIds.has(provider.id)) &&
      (!search || `${provider.name} ${provider.id}`.toLowerCase().includes(search)),
  );
}
