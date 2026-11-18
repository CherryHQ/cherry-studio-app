import { loggerService } from '@logger';
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
import { isHttpError } from '@/backend/services/http';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  CLOUD_PROVIDER_ID,
  CloudAccessError,
  CloudAccountSchema,
  CloudAmdStatusSchema,
  CloudModelSchema,
  CloudPlansSchema,
  cloudModelUnavailable,
  hasActiveCloudSubscription,
  isCloudAmdModel,
  isCloudModelListed,
  type CloudModelUse,
  type CloudModule,
  type CloudState,
} from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';

import {
  CLOUD_AMD_ENTRY_PATH,
  CLOUD_AMD_STATUS_PATH,
  CloudAmdRequestError,
  cloudAmdRetryDeadline,
  readCloudAmdEntry,
  readCloudAmdGatewayCode,
} from './cloudAmd';
import { cloudClientSignatureHeaders } from './cloudClientSignature';
import { createCloudIdempotencyKey, loadCloudDevice, type CloudDevice } from './cloudDevice';
import { CloudSession, type CloudIdentitySource } from './CloudSession';
import { projectCloudModels } from './projectCloudModels';

const EMPTY: CloudState = {
  phase: 'signed_out',
  isRefreshing: false,
  account: null,
  plans: null,
  models: [],
};

const CloudServiceConfigSchema = z.object({
  apiOrigin: z.url({ protocol: /^https$/ }).transform((value, context) => {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      context.addIssue({ code: 'custom', message: 'Expected an HTTPS API origin' });
      return z.NEVER;
    }
    return url.origin;
  }),
});
type CloudServiceConfig = z.infer<typeof CloudServiceConfigSchema>;

@Injectable('CloudRuntime')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('continue')
@DependsOn(['DbService'])
export class CloudRuntime extends BaseService implements CloudModule {
  private snapshot = EMPTY;
  private readonly changes = new Emitter<void>();
  private source: CloudIdentitySource | undefined;
  private configuration: CloudServiceConfig | undefined;
  private version = '';
  private identityKey: string | null = null;
  private lifetime = new AbortController();
  private session: CloudSession | undefined;
  private device: Promise<CloudDevice> | undefined;
  private refreshing: Promise<void> | undefined;
  private loadingPlans: Promise<void> | undefined;
  private loadingAmd: Promise<void> | undefined;
  private readonly amdRetryUntil = new Map<string, number>();
  private projection: Promise<void> = Promise.resolve();
  private refreshedAt = 0;
  private started = false;
  private stopped = false;
  private projectedCatalog: string | undefined;
  private pendingProjections = 0;

  constructor(private readonly db: DbService) {
    super();
  }

  configure(source: CloudIdentitySource, version: string): void {
    this.source = source;
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
    // Also disable a previously persisted catalog on a signed-out cold start.
    this.project([], this.lifetime.signal);
    this.changeIdentity();
  }

  private changeIdentity(): void {
    if (this.stopped) return;
    const identity = this.source?.getIdentity();
    const key = identity ? JSON.stringify([identity.key, identity.apiOrigin]) : null;
    if (key === this.identityKey) return;
    this.lifetime.abort();
    void this.session?.revoke().catch(() => {});
    this.lifetime = new AbortController();
    this.session = undefined;
    // Only the selected account's validated HTTPS services may receive its credentials.
    const configuration = CloudServiceConfigSchema.safeParse(identity);
    this.configuration = configuration.success ? configuration.data : undefined;
    if (identity && !configuration.success)
      loggerService
        .withContext('CloudRuntime')
        .error('Cloud services are not configured correctly');
    this.identityKey = key;
    this.refreshing = undefined;
    this.loadingPlans = undefined;
    this.loadingAmd = undefined;
    this.amdRetryUntil.clear();
    this.refreshedAt = 0;
    this.projectedCatalog = undefined;
    this.publish(key ? { ...EMPTY, phase: 'loading' } : EMPTY);
    this.project([], this.lifetime.signal);
    // Restore once when the cold-start account becomes available; repeated identity notifications
    // keep the same key. A newly signed-in account must load its own state as well.
    if (key) void this.refreshState(true).catch(() => {});
  }

  readonly refresh = (): Promise<void> => this.refreshState(false);

  readonly refreshProvider = async (): Promise<void> => {
    if (!this.started || this.stopped || !this.identityKey) return;
    const { signal } = this.lifetime;
    // An in-flight read may have taken its snapshot before the browser changed the account.
    await Promise.allSettled([this.refreshing, this.loadingAmd]);
    if (signal.aborted) return;

    const catalog = this.refresh();
    const status =
      this.snapshot.account?.account.status === 'active'
        ? this.refreshAmd()
        : catalog.then(() => {
            if (!signal.aborted && this.snapshot.account?.account.status === 'active')
              return this.refreshAmd();
          });
    await Promise.all([catalog, status]);
  };

  readonly refreshAmd = async (): Promise<void> => {
    if (!this.started || this.stopped || !this.identityKey) return;
    if (!this.loadingAmd) {
      const attempt = this.loadAmd(this.lifetime.signal).finally(() => {
        if (this.loadingAmd === attempt) this.loadingAmd = undefined;
      });
      this.loadingAmd = attempt;
    }
    await this.loadingAmd;
  };

  readonly createAmdEntry = async (): Promise<string> => {
    const session = this.session;
    const amd = this.snapshot.amd;
    if (!session || this.snapshot.account?.account.status !== 'active' || amd?.phase !== 'ready')
      throw new CloudAccessError('unavailable');
    const { activated, action } = amd.status;
    if (!activated && action !== 'register' && action !== 'login' && action !== 'continue')
      throw new CloudAccessError('unavailable');
    return readCloudAmdEntry(await session.postEmpty(CLOUD_AMD_ENTRY_PATH));
  };

  private async loadAmd(signal: AbortSignal): Promise<void> {
    if (this.snapshot.amd?.phase !== 'ready')
      this.publish({ ...this.snapshot, amd: { phase: 'loading' } });
    try {
      if (!this.session) await this.refreshState(true, false);
      signal.throwIfAborted();
      const session = this.session;
      if (!session) throw new CloudAccessError('unavailable');
      const status = CloudAmdStatusSchema.parse(await session.get(CLOUD_AMD_STATUS_PATH));
      signal.throwIfAborted();
      this.publish({ ...this.snapshot, amd: { phase: 'ready', status } });
    } catch (error) {
      if (signal.aborted) return;
      const unsupported = isHttpError(error) && error.status === 404;
      this.publish({ ...this.snapshot, amd: unsupported ? undefined : { phase: 'error' } });
    }
  }

  private async refreshState(silent: boolean, includePlans = true): Promise<void> {
    if (!this.started || this.stopped) return;
    const current = this.lifetime.signal;
    // Retry catalog withdrawal after a temporary storage freeze, including after sign-out.
    if (!this.identityKey) return this.project([], current);
    if (!silent) this.publish({ ...this.snapshot, isRefreshing: true });
    if (!this.refreshing) {
      const attempt = this.load(current).finally(() => {
        if (this.refreshing === attempt) this.refreshing = undefined;
      });
      this.refreshing = attempt;
    }
    await this.refreshing;
    current.throwIfAborted();
    if (includePlans && this.session && hasActiveCloudSubscription(this.snapshot))
      this.refreshPlans(this.session, current);
  }

  private async load(signal: AbortSignal): Promise<void> {
    try {
      const identity = this.source?.getIdentity();
      if (!this.source || !identity) throw new CloudAccessError('unavailable');
      if (!this.configuration || this.snapshot.phase === 'error') {
        try {
          await this.source.refreshServices?.(identity.key, signal);
        } catch (error) {
          signal.throwIfAborted();
          // Keep a known service usable when only configuration discovery is unavailable.
          loggerService
            .withContext('CloudRuntime')
            .warn('Could not refresh Cloud service configuration', error as Error);
        }
      }
      signal.throwIfAborted();
      const configuration = this.configuration;
      if (!configuration) throw new CloudAccessError('unavailable');
      this.device ??= loadCloudDevice().catch((error: unknown) => {
        this.device = undefined;
        throw error;
      });
      const device = await this.device;
      signal.throwIfAborted();
      this.session ??= new CloudSession(
        configuration.apiOrigin,
        identity,
        this.source,
        device,
        this.version,
        signal,
      );
      const session = this.session;
      const [accountData, modelData] = await Promise.all([
        session.get('/api/v1/account'),
        session.get('/v1/models'),
      ]);
      signal.throwIfAborted();
      const account = CloudAccountSchema.parse(accountData);
      const { data: models } = z.object({ data: z.array(CloudModelSchema) }).parse(modelData);
      if (account.account.id !== identity.profileId) throw new CloudAccessError('unavailable');
      const next: CloudState = {
        phase: 'ready',
        isRefreshing: false,
        account,
        plans: this.snapshot.plans,
        models,
      };
      const entitledModels = models.filter((model) => isCloudModelListed(next, model.id));
      await this.project(entitledModels, signal);
      signal.throwIfAborted();
      this.refreshedAt = Date.now();
      this.publish({ ...next, plans: this.snapshot.plans, amd: this.snapshot.amd });
    } catch (error) {
      if (!signal.aborted) this.publish({ ...this.snapshot, phase: 'error', isRefreshing: false });
      throw error;
    }
  }

  /** Badge metadata is optional and cannot delay account/model readiness or inference. */
  private refreshPlans(session: CloudSession, signal: AbortSignal): void {
    if (this.loadingPlans) return;
    const attempt = session
      .get('/api/v1/account/plans')
      .then((data) => {
        const plans = CloudPlansSchema.parse(data);
        signal.throwIfAborted();
        this.publish({ ...this.snapshot, plans });
      })
      .catch((error: unknown) => {
        if (signal.aborted) return;
        this.publish({ ...this.snapshot, plans: null });
        loggerService
          .withContext('CloudRuntime')
          .warn('Could not load Cloud plan display metadata', error as Error);
      })
      .finally(() => {
        if (this.loadingPlans === attempt) this.loadingPlans = undefined;
      });
    this.loadingPlans = attempt;
  }

  /** The closure belongs to the account selected during model resolution, including before send. */
  createModelFetch(modelId: string, use: CloudModelUse): typeof fetch {
    const identityKey = this.identityKey;
    const lifetime = this.lifetime.signal;
    return async (input, init) => {
      lifetime.throwIfAborted();
      if (!identityKey || identityKey !== this.identityKey)
        throw new CloudAccessError('signed_out');
      if ((this.amdRetryUntil.get(modelId) ?? 0) > Date.now())
        throw new CloudAmdRequestError(429, 'RATE_LIMITED');
      if (Date.now() - this.refreshedAt > 30_000 || this.snapshot.phase !== 'ready') {
        try {
          // Sending revalidates account/model admission without refreshing badge metadata.
          await this.refreshState(false, false);
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
      // Pi's Anthropic SDK adds this marker; Cloud signs and serves the canonical messages route.
      if (model.endpoint_type === 'anthropic-messages' && url.search === '?beta=true')
        url.search = '';
      if (
        url.origin !== session.origin ||
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
        // Revalidate before the next model request without scheduling another display refresh.
        if (!lifetime.aborted) this.refreshedAt = 0;
      };
      try {
        const idempotencyKey = createCloudIdempotencyKey();
        const send = async () => {
          const signed = await session.headers('POST', path, body, idempotencyKey);
          const clientHeaders = await cloudClientSignatureHeaders('POST', path, body);
          linked.signal.throwIfAborted();
          const currentReason = cloudModelUnavailable(this.snapshot, modelId, use);
          if (currentReason) throw new CloudAccessError(currentReason);
          const headers = new Headers({ ...signed, ...clientHeaders });
          headers.set('content-type', 'application/json');
          // Only protocol headers cross this boundary; SDK keys and arbitrary extra headers do not.
          const anthropicVersion = request.headers.get('anthropic-version');
          if (anthropicVersion) headers.set('anthropic-version', anthropicVersion);
          return expoFetch(url.toString(), {
            method: 'POST',
            headers,
            body,
            signal: linked.signal,
            credentials: 'omit',
            redirect: 'error',
          });
        };
        const response = isCloudAmdModel(model)
          ? await this.sendAmdModel(modelId, session, linked.signal, send)
          : await send();
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
        const source = response.body;
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const stream = new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              try {
                linked.signal.throwIfAborted();
                reader ??= source.getReader();
                const chunk = await reader.read();
                linked.signal.throwIfAborted();
                if (chunk.done) {
                  controller.close();
                  reader.releaseLock();
                  complete();
                } else controller.enqueue(chunk.value);
              } catch (error) {
                controller.error(error);
                reader?.releaseLock();
                complete();
              }
            },
            async cancel(reason) {
              try {
                await (reader ? reader.cancel(reason) : source.cancel(reason));
              } finally {
                reader?.releaseLock();
                complete();
              }
            },
          },
          { highWaterMark: 0 },
        );
        // RN's Response constructor stringifies streams. Preserve Expo's response, as Pi's
        // transport adapter does, and allow that adapter to wrap the body for retry classification.
        Object.defineProperty(response, 'body', {
          configurable: true,
          value: stream,
        });
        return response;
      } catch (error) {
        complete();
        throw error;
      }
    };
  }

  private async sendAmdModel(
    modelId: string,
    session: CloudSession,
    signal: AbortSignal,
    send: () => Promise<Response>,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const response = await send();
      signal.throwIfAborted();
      if (response.ok) return response;
      const code = await readCloudAmdGatewayCode(response);
      signal.throwIfAborted();
      const reauthenticate =
        code === 'REAUTH_REQUIRED' || code === 'SESSION_EXPIRED' || code === 'AUTH_REQUIRED';
      if (reauthenticate) session.invalidate();
      // This is the same model operation. `send` signs with a fresh nonce and the same key.
      if (attempt === 0 && (reauthenticate || code === 'REQUEST_REPLAYED')) continue;

      if (response.status === 429) {
        const now = Date.now();
        const retryUntil = cloudAmdRetryDeadline(response.headers.get('retry-after'), now);
        if (retryUntil > now)
          this.amdRetryUntil.set(
            modelId,
            Math.max(this.amdRetryUntil.get(modelId) ?? 0, retryUntil),
          );
      }
      if (code === 'AMD_ACTIVATION_REQUIRED' || code === 'AMD_CREDENTIAL_INVALID')
        void this.refreshAmd();
      if (
        code === 'AMD_ACTIVATION_REQUIRED' ||
        code === 'AMD_CREDENTIAL_INVALID' ||
        code === 'MODEL_UNAVAILABLE'
      )
        void this.refreshState(true, false).catch(() => {});
      const failureCode = code ?? (response.status === 429 ? 'RATE_LIMITED' : 'cloud_unavailable');
      throw new CloudAmdRequestError(response.status, failureCode);
    }
  }

  private project(models: CloudState['models'], signal: AbortSignal): Promise<void> {
    const origin = this.configuration?.apiOrigin ?? null;
    const catalog = JSON.stringify([origin, models]);
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
          projectCloudModels(tx, origin, models, assertWritable),
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
    await Promise.allSettled([
      this.refreshing,
      this.loadingPlans,
      this.loadingAmd,
      this.projection,
    ]);
  }
}
