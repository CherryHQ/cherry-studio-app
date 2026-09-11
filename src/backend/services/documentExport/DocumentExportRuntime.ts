import { AppState } from 'react-native';

import { BaseService } from '@/backend/core/lifecycle/BaseService';
import {
  AppStatePolicy,
  DependsOn,
  Injectable,
  ServicePhase,
} from '@/backend/core/lifecycle/decorators';
import { Phase } from '@/backend/core/lifecycle/types';
import {
  DocumentExportError,
  type DocumentExportInput,
  type DocumentExportModule,
} from '@/shared/contracts/documentExport';

import {
  createDocumentExportSession,
  type DocumentExportDependencies,
} from './createDocumentExportSession';

@Injectable('DocumentExportRuntime')
@DependsOn(['DbService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('foreground-only')
export class DocumentExportRuntime extends BaseService implements DocumentExportModule {
  private dependencies: DocumentExportDependencies | undefined;
  private stopped = false;
  private foreground = AppState.currentState === 'active';
  private readonly sessions = new Set<ReturnType<typeof createDocumentExportSession>>();

  configure(dependencies: DocumentExportDependencies) {
    this.dependencies = dependencies;
  }

  createSession(input: DocumentExportInput) {
    this.assertActive();
    if (!this.dependencies) throw new DocumentExportError('disposed');
    if (this.sessions.size >= 4) throw new DocumentExportError('busy');
    const session = createDocumentExportSession(
      input,
      this.dependencies,
      () => this.assertActive(),
      () => this.sessions.delete(session),
    );
    this.sessions.add(session);
    return session;
  }

  protected onInit() {
    this.foreground = AppState.currentState === 'active';
    this.registerAppStateListener((state) => {
      this.foreground = state === 'active';
      if (!this.foreground) this.sessions.forEach((session) => session.cancel());
    });
  }

  protected async onStop() {
    this.stopped = true;
    await Promise.allSettled([...this.sessions].map((session) => session.dispose()));
  }

  protected onDestroy() {
    return this.onStop();
  }

  private assertActive() {
    if (this.stopped) throw new DocumentExportError('disposed');
    if (!this.isReady || !this.foreground) throw new DocumentExportError('inactive');
  }
}
