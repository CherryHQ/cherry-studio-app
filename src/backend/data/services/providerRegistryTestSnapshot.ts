/** Test-only catalog fixture. Never import this helper from application code. */
import {
  getMobileRegistryLoader,
  type MobileRegistryLoader,
} from '@cherrystudio/provider-registry/mobile';

import models from '../../../../packages/provider-registry/data/models.json';
import providerModels from '../../../../packages/provider-registry/data/provider-models.json';

export const providerRegistryTestSnapshot = getMobileRegistryLoader().parseRemoteSnapshot({
  models,
  providerModels,
});

export function installProviderRegistryTestSnapshot(
  loader: MobileRegistryLoader = getMobileRegistryLoader(),
): void {
  loader.installRemoteSnapshot(providerRegistryTestSnapshot);
}
