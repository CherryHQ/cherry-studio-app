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
  type HtmlConversionContext,
  type HtmlConversionInput,
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
  private conversion: { controller: AbortController; promise: Promise<unknown> } | undefined;

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

  convertHtml(input: HtmlConversionInput, context?: HtmlConversionContext) {
    this.assertActive();
    if (!this.dependencies) throw new DocumentExportError('disposed');
    if (this.conversion) throw new DocumentExportError('busy');
    context?.signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    context?.signal?.addEventListener('abort', abort, { once: true });
    const dependencies = this.dependencies;
    const promise = Promise.resolve()
      .then(async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- do not load the ZIP writer until conversion is requested
        const { convertHtml } = require('./convertHtml') as typeof import('./convertHtml');
        return convertHtml(input, dependencies, controller.signal, context?.onProgress);
      })
      .finally(() => {
        context?.signal?.removeEventListener('abort', abort);
        this.conversion = undefined;
      });
    this.conversion = { controller, promise };
    return promise;
  }

  protected onInit() {
    this.foreground = AppState.currentState === 'active';
    this.registerAppStateListener((state) => {
      this.foreground = state === 'active';
      if (!this.foreground) this.sessions.forEach((session) => session.cancel());
      if (!this.foreground) this.conversion?.controller.abort();
    });
  }

  protected async onStop() {
    this.stopped = true;
    this.conversion?.controller.abort();
    await Promise.allSettled([
      ...[...this.sessions].map((session) => session.dispose()),
      this.conversion?.promise,
    ]);
  }

  protected onDestroy() {
    return this.onStop();
  }

  private assertActive() {
    if (this.stopped) throw new DocumentExportError('disposed');
    if (!this.isReady || !this.foreground) throw new DocumentExportError('inactive');
  }
}
