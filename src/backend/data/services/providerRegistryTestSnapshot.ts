import models from '@cherrystudio/provider-registry/data/models.json';
import providerModels from '@cherrystudio/provider-registry/data/provider-models.json';

/** Test-only catalog fixture. Never import this helper from application code. */
import {
  getMobileRegistryLoader,
  type MobileRegistryLoader,
} from '@/backend/data/services/MobileRegistryLoader';

export const providerRegistryTestSnapshot = getMobileRegistryLoader().parseRemoteSnapshot({
  models,
  providerModels,
});

export function installProviderRegistryTestSnapshot(
  loader: MobileRegistryLoader = getMobileRegistryLoader(),
): void {
  loader.installRemoteSnapshot(providerRegistryTestSnapshot);
}
