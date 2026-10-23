import models from '@cherrystudio/provider-registry/data/models.json';
import providerModels from '@cherrystudio/provider-registry/data/provider-models.json';
import providers from '@cherrystudio/provider-registry/data/providers.json';

/** Test-only catalog fixture. Never import this helper from application code. */
import {
  getMobileRegistryLoader,
  type MobileRegistryLoader,
} from '@/backend/data/services/MobileRegistryLoader';

export const providerRegistryTestSnapshot = getMobileRegistryLoader().parseRemoteSnapshot({
  models,
  providers,
  providerModels,
});

export function installProviderRegistryTestSnapshot(
  loader: MobileRegistryLoader = getMobileRegistryLoader(),
): void {
  loader.installRemoteSnapshot(providerRegistryTestSnapshot);
}
