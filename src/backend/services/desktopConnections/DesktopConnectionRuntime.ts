import { loggerService } from '@logger';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';
import type { DesktopConnectionsModule } from '@/shared/contracts';
import { DataApiError } from '@/shared/data/api/errors';
import {
  DesktopProvidersSnapshotSchema,
  PairDesktopConnectionSchema,
  type DesktopImportSelectionsDto,
  type PairDesktopConnectionDto,
} from '@/shared/data/api/schemas/desktopConnections';

import {
  AuthorizationError,
  baseUrlsFromQr,
  desktopError,
  fetchSnapshot,
  pairDesktop,
  PairingRejectedError,
} from './desktopConnectionClient';

type ConnectionStore = Pick<
  DesktopConnectionService,
  'getRow' | 'savePair' | 'remove' | 'updateStatus' | 'preview' | 'import'
>;
const EXCLUDED_PROVIDER_IDS = new Set([
  'cherryai',
  'gpustack',
  'lmstudio',
  'local-embedding',
  'ollama',
  'ovms',
]);
const logger = loggerService.withContext('DesktopConnection');
const tokenKey = (id: string) => `desktop-connection-token.${id}`;
const TOKEN_STORE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** Owns paired credentials and in-flight work; drains before the originating database closes. */
@Injectable('DesktopConnectionRuntime')
@DependsOn(['DbService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class DesktopConnectionRuntime extends BaseService implements DesktopConnectionsModule {
  private store: ConnectionStore | undefined;
  private ensureModelRegistryReady: (() => Promise<void>) | undefined;
  private stopped = false;
  private readonly controllers = new Set<AbortController>();
  private tail: Promise<unknown> = Promise.resolve();

  configure(store: ConnectionStore, ensureModelRegistryReady: () => Promise<void>): void {
    this.store = store;
    this.ensureModelRegistryReady = ensureModelRegistryReady;
  }

  pair(input: PairDesktopConnectionDto, signal: AbortSignal) {
    return this.run('pair', signal, async (store, signal) => {
      const qr = PairDesktopConnectionSchema.parse(input);
      const id = qr.connectionId ?? Crypto.randomUUID();
      if (qr.connectionId) await store.getRow(id);
      const baseUrls = baseUrlsFromQr(qr);
      const paired = await pairDesktop(baseUrls, qr, signal).catch((error: unknown) => {
        if (error instanceof PairingRejectedError) {
          throw desktopError('pairing-rejected', 'The pairing code is invalid or expired');
        }
        throw error;
      });
      signal.throwIfAborted();
      const key = tokenKey(id);
      const previousToken = await SecureStore.getItemAsync(key);
      signal.throwIfAborted();
      // The queue serializes credential replacement with removal and snapshot reads.
      // Once a credential write starts, finish or compensate it even if the caller leaves.
      try {
        await SecureStore.setItemAsync(key, paired.token, TOKEN_STORE_OPTIONS);
        signal.throwIfAborted();
        return await store.savePair(
          {
            id,
            baseUrls,
            activeBaseUrl: paired.baseUrl,
            desktopVersion: paired.version,
            name: paired.name,
          },
          Boolean(qr.connectionId),
          signal,
        );
      } catch (error) {
        if (previousToken) {
          await SecureStore.setItemAsync(key, previousToken, TOKEN_STORE_OPTIONS);
        } else {
          await SecureStore.deleteItemAsync(key);
        }
        throw error;
      }
    });
  }

  remove(id: string, signal: AbortSignal) {
    return this.run('remove', signal, async (store, signal) => {
      signal.throwIfAborted();
      // Delete the credential first. Failure leaves a visible, retryable row.
      // Both deletes are idempotent, including a retry after the SQL delete failed.
      await SecureStore.deleteItemAsync(tokenKey(id));
      await store.remove(id);
    });
  }

  preview(id: string, signal: AbortSignal) {
    return this.run('preview', signal, async (store, signal) => {
      const snapshot = await this.loadSnapshot(store, id, signal);
      signal.throwIfAborted();
      return store.preview(snapshot);
    });
  }

  import(id: string, input: DesktopImportSelectionsDto, signal: AbortSignal) {
    return this.run('import', signal, async (store, signal) => {
      const snapshot = await this.loadSnapshot(store, id, signal);
      signal.throwIfAborted();
      if (input.selections.some((selection) => selection.mode === 'provider-models')) {
        await this.ensureModelRegistryReady!();
      }
      signal.throwIfAborted();
      return store.import(id, snapshot, input, signal);
    });
  }

  protected async onStop(): Promise<void> {
    this.stopped = true;
    for (const controller of this.controllers) controller.abort();
    await this.tail;
  }

  private run<T>(
    operation: string,
    caller: AbortSignal,
    work: (store: ConnectionStore, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.stopped) return Promise.reject(new DOMException('Runtime stopped', 'AbortError'));
    const controller = new AbortController();
    const cancel = () => controller.abort(caller.reason);
    caller.addEventListener('abort', cancel, { once: true });
    if (caller.aborted) cancel();
    this.controllers.add(controller);
    const pending = this.tail
      .then(async () => {
        controller.signal.throwIfAborted();
        if (!this.store) throw new Error('Desktop connection store has not been configured');
        return work(this.store, controller.signal);
      })
      .finally(() => {
        caller.removeEventListener('abort', cancel);
        this.controllers.delete(controller);
      });
    this.tail = pending.catch((error: unknown) => this.reportUnexpected(operation, error));
    return pending;
  }

  /** A reason speaks for itself; anything else surfaces as "try again" and leaves no other trace. */
  private reportUnexpected(operation: string, error: unknown): void {
    if (!(error instanceof Error) || error.name === 'AbortError') return;
    if (error instanceof DataApiError && typeof error.details?.reason === 'string') return;
    logger.error(`Desktop connection ${operation} failed`, error, {
      operation: `desktop.${operation}`,
    });
  }

  /** The payload itself never reaches a report, so carry what identifies the desktop that sent it. */
  private reportDrift(
    error: DataApiError,
    desktopVersion: string,
    context: Record<string, unknown>,
  ): DataApiError {
    logger.error(error.message, error, {
      ...context,
      desktopVersion,
      operation: 'desktop.snapshot.parse',
    });
    return error;
  }

  private async loadSnapshot(store: ConnectionStore, id: string, signal: AbortSignal) {
    const connection = await store.getRow(id);
    signal.throwIfAborted();
    const token = await SecureStore.getItemAsync(tokenKey(id));
    signal.throwIfAborted();
    if (!token) {
      await store.updateStatus(id, { status: 'needs-repair' }, signal);
      throw desktopError('auth-revoked', 'This desktop connection needs to be paired again');
    }
    const urls = [
      connection.activeBaseUrl,
      ...connection.baseUrls.filter((url) => url !== connection.activeBaseUrl),
    ];
    const response = await fetchSnapshot(urls, token, signal).catch(async (error: unknown) => {
      signal.throwIfAborted();
      if (error instanceof AuthorizationError) {
        if (error.status === 403) {
          await store.updateStatus(id, { status: 'needs-repair' }, signal);
          throw desktopError('auth-revoked', 'This desktop connection needs to be paired again');
        }
        throw desktopError('unauthorized', 'The desktop rejected this device token');
      }
      throw error;
    });
    signal.throwIfAborted();
    const version =
      typeof response.payload === 'object' && response.payload !== null
        ? (response.payload as Record<string, unknown>).version
        : undefined;
    if (version !== 1) {
      const error = desktopError(
        typeof version === 'number' ? 'unsupported-version' : 'invalid-snapshot',
        'Desktop returned an unsupported or invalid configuration version',
      );
      throw this.reportDrift(error, connection.desktopVersion, {
        snapshotVersion: typeof version === 'number' ? version : typeof version,
      });
    }
    const parsed = DesktopProvidersSnapshotSchema.safeParse(response.payload);
    if (!parsed.success) {
      const error = desktopError('invalid-snapshot', 'Desktop returned invalid configuration data');
      // Field paths locate the drift; the rejected values stay out of the report.
      throw this.reportDrift(error, connection.desktopVersion, {
        issues: parsed.error.issues
          .slice(0, 10)
          .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`),
      });
    }
    await store.updateStatus(
      id,
      {
        activeBaseUrl: response.baseUrl,
        lastFetchedAt: Date.now(),
        status: 'paired',
      },
      signal,
    );
    return {
      ...parsed.data,
      providers: parsed.data.providers.filter(
        (provider) =>
          ![provider.id, provider.presetProviderId, provider.type].some(
            (id) => id && EXCLUDED_PROVIDER_IDS.has(id.toLowerCase()),
          ),
      ),
    };
  }
}
