import type { ProviderEdition } from '@cherrystudio/provider-registry';
import { getLocales } from 'expo-localization';

/** Prefer detected egress country, then device region, retaining CN if neither is available. */
export function getProviderCatalogEdition(country: string | null): ProviderEdition {
  const region = country ?? getLocales()[0]?.regionCode ?? 'CN';
  return region === 'CN' ? 'cn' : 'global';
}
