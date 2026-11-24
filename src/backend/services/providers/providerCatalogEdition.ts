import type { ProviderEdition } from '@cherrystudio/provider-registry';
import { getLocales } from 'expo-localization';

import type { NetworkRegion } from '@/backend/services/region';

/** Prefer detected egress region, then device region, retaining CN if neither is available. */
export function getProviderCatalogEdition(region: NetworkRegion | null): ProviderEdition {
  if (region) return region === 'CN' ? 'cn' : 'global';
  return (getLocales()[0]?.regionCode?.toUpperCase() ?? 'CN') === 'CN' ? 'cn' : 'global';
}
