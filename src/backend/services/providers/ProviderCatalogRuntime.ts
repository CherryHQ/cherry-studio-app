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

/** Installs the first recommended set after region detection, without gating first paint. */
@Injectable('ProviderCatalogRuntime')
@DependsOn(['DbService', 'RegionService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('not-applicable')
export class ProviderCatalogRuntime extends BaseService {
  private initialization: Promise<void> | undefined;
  private stopped = false;
  private pending = false;

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
      const country = await application.get('RegionService').getCountry();
      this.initializationSignal?.throwIfAborted();
      if (this.stopped) throw new Error('Provider catalog has stopped');
      return country === 'CN' ? 'cn' : 'global';
    });
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
    await this.initialization?.catch(() => {});
  }
}
