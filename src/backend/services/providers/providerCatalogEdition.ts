import type { ProviderEdition } from '@cherrystudio/provider-registry';

/** All distributions select by egress country, using domestic discovery when unknown. */
export function getProviderCatalogEdition(country: string | null): ProviderEdition {
  return country === null || country === 'CN' ? 'cn' : 'global';
}
