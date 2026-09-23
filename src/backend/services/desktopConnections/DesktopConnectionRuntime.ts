import { loggerService } from '@logger';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

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
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import {
  type DesktopImportSelectionsDto,
  type DesktopPairingClaim,
  type DesktopPairingQr,
  DesktopPairingQrSchema,
  DesktopProvidersSnapshotSchema,
  type PairDesktopConnectionDto,
  PairDesktopConnectionSchema,
} from '@/shared/data/api/schemas/desktopConnections';

import type { DesktopConnectionManager } from './DesktopConnectionManager';
import { DesktopSession, DesktopUnreachableError, RemoteFailureError } from './DesktopSession';

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
const CLAIM_POLL_MS = 2_000;
const EXPORT_PAGE_BYTES = 24_576;
const logger = loggerService.withContext('DesktopConnection');

export function desktopError(reason: string, message: string): DataApiError {
  return new DataApiError(ErrorCode.INVALID_OPERATION, message, { reason });
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });

/** Owns pairing/configuration workflows and drains their operations before the connection manager. */
@Injectable('DesktopConnectionRuntime')
@DependsOn(['DesktopConnectionManager', 'DbService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class DesktopConnectionRuntime extends BaseService implements DesktopConnectionsModule {
  private store: ConnectionStore | undefined;
  private connections?: DesktopConnectionManager;
  private ensureModelRegistryReady: (() => Promise<void>) | undefined;
  private stopped = false;
  private readonly controllers = new Set<AbortController>();
  private tail: Promise<unknown> = Promise.resolve();

  configure(
    store: ConnectionStore,
    ensureModelRegistryReady: () => Promise<void>,
    connections: DesktopConnectionManager,
  ): void {
    this.connections = connections;
    this.store = store;
    this.ensureModelRegistryReady = ensureModelRegistryReady;
  }

  pair(
    input: PairDesktopConnectionDto,
    signal: AbortSignal,
    onClaim?: (claim: DesktopPairingClaim) => void,
  ) {
    return this.run('pair', signal, async (store, signal) => {
      const qr = PairDesktopConnectionSchema.parse(input);
      const id = qr.connectionId ?? Crypto.randomUUID();
      if (qr.connectionId) await store.getRow(id);
      const session = await this.connect(qr, signal).catch((error: unknown) => {
        throw translate(error);
      });
      try {
        const claim = await session.request(
          'pairing.claim',
          {
            capabilities: qr.capabilities,
            deviceName: deviceName(),
            invitationId: qr.invitationId,
            invitationSecret: qr.invitationSecret,
            platform: Platform.OS === 'ios' ? 'ios' : 'android',
          },
          signal,
        );
        onClaim?.({ expiresAt: claim.expiresAt, verificationCode: claim.verificationCode });
        for (;;) {
          const decision = await session.request('pairing.get', { claimId: claim.claimId }, signal);
          if (decision.status === 'approved') {
            const connection = await store.savePair(
              {
                desktopIdentity: qr.desktopIdentity,
                deviceId: decision.deviceId,
                grants: decision.authorization.grants,
                id,
                name: qr.name,
              },
              Boolean(qr.connectionId),
              signal,
            );
            this.connections!.invalidate(id);
            this.connections!.seedLocation(
              id,
              qr.desktopIdentity,
              qr.ips.map((host) => ({ host, port: qr.port, security: 'ws' })),
            );
            return connection;
          }
          if (decision.status === 'rejected') {
            throw desktopError('pairing-rejected', 'The desktop rejected this device');
          }
          if (decision.status === 'expired') {
            throw desktopError(
              'pairing-expired',
              'The pairing invitation expired before it was approved',
            );
          }
          await sleep(CLAIM_POLL_MS, signal);
        }
      } catch (error) {
        throw translate(error);
      } finally {
        session.close();
      }
    });
  }

  updateLocation(id: string, input: DesktopPairingQr, signal: AbortSignal) {
    return this.run('location', signal, async (store, signal) => {
      const qr = DesktopPairingQrSchema.parse(input);
      const row = await store.getRow(id);
      signal.throwIfAborted();
      if (row.desktopIdentity !== qr.desktopIdentity)
        throw desktopError('identity-mismatch', 'This code belongs to a different desktop');
      this.connections!.seedLocation(
        id,
        row.desktopIdentity,
        qr.ips.map((host) => ({ host, port: qr.port, security: 'ws' })),
      );
    });
  }

  remove(id: string, signal: AbortSignal) {
    return this.run('remove', signal, async (store, signal) => {
      signal.throwIfAborted();
      await store.remove(id);
      this.connections!.invalidate(id, 'removed');
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

  private connect(
    target: { ips: string[]; desktopIdentity: string; port: number },
    signal: AbortSignal,
  ): Promise<DesktopSession> {
    return this.connections!.connectTemporary(
      { addresses: target.ips, desktopIdentity: target.desktopIdentity, port: target.port },
      signal,
    );
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

  /** The payload itself never reaches a report, so carry only what locates the drift. */
  private reportDrift(error: DataApiError, context: Record<string, unknown>): DataApiError {
    logger.error(error.message, error, { ...context, operation: 'desktop.snapshot.parse' });
    return error;
  }

  private async loadSnapshot(store: ConnectionStore, id: string, signal: AbortSignal) {
    const row = await store.getRow(id);
    if (!row.grants.some((grant) => grant.domain === 'configuration')) {
      throw desktopError(
        'configuration-not-granted',
        'The desktop did not allow configuration sync for this device',
      );
    }
    const lease = await this.connections!.retain(id, 'configuration', signal);
    const readSignal = AbortSignal.any([signal, lease.signal]);
    let payload: unknown;
    try {
      const session = await lease.ready(readSignal);
      const prepared = await session.request('configuration.export.prepare', {}, readSignal);
      const bytes = new Uint8Array(Number(prepared.byteLength));
      let offset = 0;
      for (;;) {
        const page = await session.request(
          'configuration.export.read',
          { exportId: prepared.exportId, maxBytes: EXPORT_PAGE_BYTES, offset: String(offset) },
          readSignal,
        );
        const chunk = fromBase64(page.dataBase64);
        if (offset + chunk.length > bytes.length) break;
        bytes.set(chunk, offset);
        offset += chunk.length;
        if (page.eof || chunk.length === 0) break;
      }
      if (offset !== bytes.length || toHex(sha256(bytes)) !== prepared.sha256) {
        throw this.reportDrift(
          desktopError('invalid-snapshot', 'Desktop returned invalid configuration data'),
          { received: offset, expected: bytes.length },
        );
      }
      readSignal.throwIfAborted();
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      if (
        error instanceof RemoteFailureError &&
        (error.reason === 'GRANT_REVOKED' || error.reason === 'FORBIDDEN')
      ) {
        await this.connections!.revoke(id, 'configuration', lease.grantId);
        throw desktopError('configuration-not-granted', 'Configuration grant was revoked');
      }
      throw translate(error);
    } finally {
      lease.release();
    }
    signal.throwIfAborted();
    const version =
      typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>).version
        : undefined;
    if (version !== 1) {
      throw this.reportDrift(
        desktopError(
          typeof version === 'number' ? 'unsupported-version' : 'invalid-snapshot',
          'Desktop returned an unsupported or invalid configuration version',
        ),
        { snapshotVersion: typeof version === 'number' ? version : typeof version },
      );
    }
    const parsed = DesktopProvidersSnapshotSchema.safeParse(payload);
    if (!parsed.success) {
      throw this.reportDrift(
        desktopError('invalid-snapshot', 'Desktop returned invalid configuration data'),
        {
          issues: parsed.error.issues
            .slice(0, 10)
            .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`),
        },
      );
    }
    await store.updateStatus(id, { lastFetchedAt: Date.now() }, signal, row);
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

function deviceName(): string {
  const reported = (Device.deviceName ?? Device.modelName ?? '').trim();
  return (reported || 'Cherry Studio Mobile').slice(0, 64);
}

/** Protocol failures become the reason codes the settings screens already translate. */
function translate(error: unknown): unknown {
  if (error instanceof DesktopUnreachableError) {
    logger.warn('Desktop unreachable', { attempts: error.attempts });
    return desktopError(error.reason, 'Could not connect to the desktop');
  }
  if (!(error instanceof RemoteFailureError)) {
    if (error instanceof Error && error.name !== 'AbortError') {
      logger.warn('Desktop connection failed', { error: error.message, name: error.name });
    }
    return error;
  }
  logger.warn('Desktop refused the request', { reason: error.reason, message: error.message });
  switch (error.reason) {
    case 'UPGRADE_REQUIRED':
      return desktopError('unsupported-version', 'This desktop protocol version is not supported');
    case 'UNAUTHENTICATED':
    case 'GRANT_REVOKED':
      return desktopError('auth-revoked', 'This desktop connection needs to be paired again');
    case 'FORBIDDEN':
    case 'CONFLICT':
      return desktopError('pairing-rejected', error.message);
    default:
      return desktopError('desktop-failure', error.message);
  }
}
