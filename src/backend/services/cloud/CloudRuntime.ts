import { loggerService } from '@logger';
import * as Crypto from 'expo-crypto';
import { fetch as expoFetch } from 'expo/fetch';
import * as z from 'zod';

import { BaseService } from '@/backend/core/lifecycle/BaseService';
import {
  AppStatePolicy,
  DependsOn,
  Injectable,
  ServicePhase,
} from '@/backend/core/lifecycle/decorators';
import { Emitter } from '@/backend/core/lifecycle/event';
import { Phase } from '@/backend/core/lifecycle/types';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { DbService } from '@/backend/data/db/DbService';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  CLOUD_PROVIDER_ID,
  CloudAccessError,
  CloudAccountSchema,
  CloudModelSchema,
  cloudModelUnavailable,
  CloudPlansSchema,
  type CloudModelUse,
  type CloudModule,
  type CloudState,
} from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';

import { loadCloudDevice, type CloudDevice } from './cloudDevice';
import { CloudSession, type CloudIdentitySource } from './CloudSession';
import { projectCloudModels } from './projectCloudModels';

const EMPTY: CloudState = {
  phase: 'signed_out',
  isRefreshing: false,
  account: null,
  plans: null,
  models: [],
};

@Injectable('CloudRuntime')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('foreground-refresh')
@DependsOn(['DbService'])
export class CloudRuntime extends BaseService implements CloudModule {
  private snapshot = EMPTY;
  private readonly changes = new Emitter<void>();
  private source: CloudIdentitySource | undefined;
  private origin = '';
  private version = '';
  private identityKey: string | null = null;
  private lifetime = new AbortController();
  private session: CloudSession | undefined;
  private device: Promise<CloudDevice> | undefined;
  private refreshing: Promise<void> | undefined;
  private projection: Promise<void> = Promise.resolve();
  private refreshedAt = 0;
  private started = false;
  private stopped = false;
  private projectedCatalog: string | undefined;
  private pendingProjections = 0;

  constructor(private readonly db: DbService) {
    super();
  }

  configure(source: CloudIdentitySource, origin: string, version: string): void {
    this.source = source;
    // Cloud credentials only leave the installation for the explicitly configured HTTPS origin.
    if (origin) {
      try {
        const url = new URL(origin);
        if (
          url.protocol !== 'https:' ||
          url.username ||
          url.password ||
          url.pathname !== '/' ||
          url.search ||
          url.hash
        )
          throw new Error('Invalid Cloud API origin');
        this.origin = url.origin;
      } catch {
        loggerService
          .withContext('CloudRuntime')
          .error('Cloud API origin is not configured correctly');
      }
    }
    this.version = version;
  }

  readonly getState = (): CloudState => this.snapshot;
  readonly subscribe = (listener: () => void): (() => void) => {
    const subscription = this.changes.event(listener);
    return () => subscription.dispose();
  };

  protected override onAllReady(): void {
    if (isEnterpriseProfile() || !this.source) return;
    this.started = true;
    this.registerDisposable(this.source.subscribe(() => this.changeIdentity()));
    this.registerAppStateListener((status) => {
      if (status === 'active') this.refreshInBackground();
    });
    this.registerInterval(() => this.refreshInBackground(), 60_000);
    // Also disable a previously persisted catalog on a signed-out cold start.
    this.project([], this.lifetime.signal);
    this.changeIdentity();
  }

  private changeIdentity(): void {
    if (this.stopped) return;
    const key = this.source?.getIdentity()?.key ?? null;
    if (key === this.identityKey) return;
    this.lifetime.abort();
    void this.session?.revoke().catch(() => {});
    this.lifetime = new AbortController();
    this.session = undefined;
    this.identityKey = key;
    this.refreshing = undefined;
    this.refreshedAt = 0;
    this.projectedCatalog = undefined;
    this.publish(key ? { ...EMPTY, phase: 'loading' } : EMPTY);
    this.project([], this.lifetime.signal);
    if (key) this.refreshInBackground();
  }

  readonly refresh = async (): Promise<void> => {
    if (!this.started || this.stopped) return;
    const current = this.lifetime.signal;
    // Retry catalog withdrawal after a temporary storage freeze, including after sign-out.
    if (!this.identityKey) return this.project([], current);
    if (!this.refreshing) {
      const attempt = this.load(current).finally(() => {
        if (this.refreshing === attempt) this.refreshing = undefined;
      });
      this.refreshing = attempt;
    }
    return this.refreshing;
  };

  private refreshInBackground(): void {
    void this.refresh().catch(() => {});
  }

  private async load(signal: AbortSignal): Promise<void> {
    this.publish({ ...this.snapshot, isRefreshing: true });
    try {
      const identity = this.source?.getIdentity();
      if (!this.source || !identity || !this.origin) throw new CloudAccessError('unavailable');
      this.device ??= loadCloudDevice().catch((error: unknown) => {
        this.device = undefined;
        throw error;
      });
      const device = await this.device;
      signal.throwIfAborted();
      this.session ??= new CloudSession(
        this.origin,
        identity,
        this.source,
        device,
        this.version,
        signal,
      );
      const session = this.session;
      const [accountData, planData, modelData] = await Promise.all([
        session.get('/api/v1/account'),
        session.get('/api/v1/account/plans'),
        session.get('/v1/models'),
      ]);
      signal.throwIfAborted();
      const account = CloudAccountSchema.parse(accountData);
      const plans = CloudPlansSchema.parse(planData);
      const { data: models } = z.object({ data: z.array(CloudModelSchema) }).parse(modelData);
      if (account.account.id !== identity.profileId) throw new CloudAccessError('unavailable');
      const next: CloudState = { phase: 'ready', isRefreshing: false, account, plans, models };
      const entitledModels = models.filter((model) =>
        ['agent', 'general'].some((use) => {
          const reason = cloudModelUnavailable(next, model.id, use as CloudModelUse);
          return reason === undefined || reason === 'quota_exhausted';
        }),
      );
      await this.project(entitledModels, signal);
      signal.throwIfAborted();
      this.refreshedAt = Date.now();
      this.publish(next);
    } catch (error) {
      if (!signal.aborted) this.publish({ ...this.snapshot, phase: 'error', isRefreshing: false });
      throw error;
    }
  }

  /** The closure belongs to the account selected during model resolution, including before send. */
  createModelFetch(modelId: string, use: CloudModelUse): typeof fetch {
    const identityKey = this.identityKey;
    const lifetime = this.lifetime.signal;
    return async (input, init) => {
      lifetime.throwIfAborted();
      if (!identityKey || identityKey !== this.identityKey)
        throw new CloudAccessError('signed_out');
      if (Date.now() - this.refreshedAt > 30_000 || this.snapshot.phase !== 'ready') {
        try {
          await this.refresh();
        } catch {
          lifetime.throwIfAborted();
          throw new CloudAccessError('unavailable');
        }
      }
      lifetime.throwIfAborted();
      const reason = cloudModelUnavailable(this.snapshot, modelId, use);
      if (reason) throw new CloudAccessError(reason);
      const session = this.session;
      if (!session) throw new CloudAccessError('unavailable');
      const request = new Request(input, init);
      const url = new URL(request.url);
      const model = this.snapshot.models.find((entry) => entry.id === modelId)!;
      const path =
        model.endpoint_type === 'anthropic-messages' ? '/v1/messages' : '/v1/chat/completions';
      if (
        url.origin !== this.origin ||
        url.pathname !== path ||
        url.search ||
        url.hash ||
        request.method !== 'POST'
      )
        throw new CloudAccessError('unavailable');
      const body = await request.text();
      if ((JSON.parse(body) as { model?: unknown }).model !== modelId)
        throw new CloudAccessError('not_entitled');
      const linked = linkAbortSignals([lifetime, request.signal]);
      let completed = false;
      const complete = () => {
        if (completed) return;
        completed = true;
        linked.dispose();
        if (!lifetime.aborted) {
          this.refreshedAt = 0;
          this.refreshInBackground();
        }
      };
      try {
        const signed = await session.headers('POST', path, body, Crypto.randomUUID());
        linked.signal.throwIfAborted();
        const currentReason = cloudModelUnavailable(this.snapshot, modelId, use);
        if (currentReason) throw new CloudAccessError(currentReason);
        const headers = new Headers(signed);
        headers.set('content-type', 'application/json');
        // Only protocol headers cross this boundary; SDK keys and arbitrary extra headers do not.
        const anthropicVersion = request.headers.get('anthropic-version');
        if (anthropicVersion) headers.set('anthropic-version', anthropicVersion);
        const response = await expoFetch(url.toString(), {
          method: 'POST',
          headers,
          body,
          signal: linked.signal,
          credentials: 'omit',
          redirect: 'error',
        });
        linked.signal.throwIfAborted();
        if (!response.ok) {
          if (response.status === 401) session.invalidate();
          this.publish({ ...this.snapshot, phase: 'error' });
          complete();
          return response;
        }
        if (!response.body) {
          complete();
          return response;
        }
        const reader = response.body.getReader();
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const chunk = await reader.read();
              linked.signal.throwIfAborted();
              if (chunk.done) {
                controller.close();
                complete();
              } else controller.enqueue(chunk.value);
            } catch (error) {
              controller.error(error);
              complete();
            }
          },
          async cancel(reason) {
            try {
              await reader.cancel(reason);
            } finally {
              complete();
            }
          },
        });
        return new Response(stream, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        complete();
        throw error;
      }
    };
  }

  private project(models: CloudState['models'], signal: AbortSignal): Promise<void> {
    const catalog = JSON.stringify([this.origin, models]);
    this.pendingProjections++;
    const assertWritable = () => {
      signal.throwIfAborted();
      storageMutationGate.assertWritable();
    };
    const work = this.projection
      .catch(() => {})
      .then(async () => {
        assertWritable();
        if (this.projectedCatalog === catalog) return;
        const ids = await this.db.withWriteTx((tx) =>
          projectCloudModels(tx, this.origin, models, assertWritable),
        );
        signal.throwIfAborted();
        this.projectedCatalog = catalog;
        publishDataApiChanges([
          '/providers',
          '/providers/page',
          `/providers/${CLOUD_PROVIDER_ID}`,
          '/models',
          ...ids.map((id) => `/models/${id}`),
        ]);
      })
      .finally(() => {
        this.pendingProjections--;
      });
    this.projection = work;
    // Identity changes cannot await storage; requests are already revoked synchronously.
    void work.catch(() => {});
    return work;
  }

  hasPendingStorageWork(): boolean {
    return this.pendingProjections > 0 || this.refreshing !== undefined;
  }

  private publish(state: CloudState): void {
    this.snapshot = state;
    this.changes.fire();
  }

  protected override async onStop(): Promise<void> {
    this.stopped = true;
    this.lifetime.abort();
    this.session = undefined;
    this.publish(EMPTY);
    await Promise.allSettled([this.refreshing, this.projection]);
  }
}
