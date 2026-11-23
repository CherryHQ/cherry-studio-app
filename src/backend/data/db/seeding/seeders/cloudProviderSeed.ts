import { CLOUD_PROVIDER_ID, CLOUD_PROVIDER_NAME } from '@/shared/contracts/cloud';

import { userProviderTable } from '../../schemas/userProvider';
import type { DatabaseSeeder } from '../types';

/** Older catalogs wrote availability into isEnabled. Start every community profile opted in once. */
export const cloudProviderSeed: DatabaseSeeder = {
  name: 'cloud-provider',
  version: '1',
  description: 'Install the built-in CherryAI provider with its local switch enabled',
  async run(dbService) {
    await dbService.withWriteTx(async (tx) => {
      await tx
        .insert(userProviderTable)
        .values({
          providerId: CLOUD_PROVIDER_ID,
          name: CLOUD_PROVIDER_NAME,
          isEnabled: true,
          orderKey: 'a0',
        })
        .onConflictDoUpdate({ target: userProviderTable.providerId, set: { isEnabled: true } });
    });
  },
};
