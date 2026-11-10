import { application } from '@/backend/core/application/Application';
import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { seedPresetProviders } from '@/backend/data/db/seeding';
import { raceAbort } from '@/backend/utils/raceAbort';

import { getProviderCatalogEdition } from './providerCatalogEdition';

/** Installs the first recommended set using the same region policy as discovery. */
@Injectable('ProviderCatalogRuntime')
@DependsOn(['DbService', 'RegionService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('not-applicable')
export class ProviderCatalogRuntime extends BaseService {
  private initialization: Promise<void> | undefined;
  private stopped = false;
  private pending = false;
  private readonly controller = new AbortController();

  ensureReady(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('Provider catalog has stopped'));
    if (!this.initialization) {
      storageMutationGate.assertWritable();
      this.pending = true;
      this.initialization = this.initializeCatalog()
        .finally(() => {
          this.pending = false;
        })
        .catch((error) => {
          this.initialization = undefined;
          throw error;
        });
    }
    return this.initialization;
  }

  hasPendingStorageWork(): boolean {
    return this.pending;
  }

  private async initializeCatalog(): Promise<void> {
    const db = application.get('DbService');
    await seedPresetProviders(db, async () => {
      const country = await raceAbort(
        application.get('RegionService').getCountry(),
        this.controller.signal,
      );
      this.initializationSignal?.throwIfAborted();
      if (this.stopped) throw new Error('Provider catalog has stopped');
      return getProviderCatalogEdition(country);
    });
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
    this.controller.abort();
    await this.initialization?.catch(() => {});
  }
}
