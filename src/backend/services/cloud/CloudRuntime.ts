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
import { createHttpClient, isHttpError } from '@/backend/services/http';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import { raceAbort } from '@/backend/utils/raceAbort';
import {
  CLOUD_PROVIDER_ID,
  CloudAccessError,
  CloudAccountSchema,
  CloudAmdStatusSchema,
  CloudModelCatalogSchema,
  CloudPlansSchema,
  cloudModelUnavailable,
  isCloudAmdModel,
  isCloudModelListed,
  supportsCloudModelUse,
  type CloudModelUse,
  type CloudModule,
  type CloudState,
} from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';
import { readGatewayRequestId } from '@/shared/utils/providerDiagnostics';

import { cloudActivationPath, CLOUD_AMD_STATUS_PATH, readCloudActivationEntry } from './cloudAmd';
import { cloudClientSignatureHeaders } from './cloudClientSignature';
import { createCloudIdempotencyKey, loadCloudDevice, type CloudDevice } from './cloudDevice';
import {
  CloudGatewayRequestError,
  cloudRetryDeadline,
  cloudSessionIssue,
  readCloudGatewayCode,
  readCloudUpstreamErrorBody,
} from './cloudGatewayError';
import { CloudSession, type CloudIdentitySource } from './CloudSession';
import { projectCloudModels } from './projectCloudModels';

const MODEL_CATALOG_PATH = '/v1/models?limit=1000&catalog=full';
const MODEL_RESPONSE_HEADERS_TIMEOUT_MS = 60_000;

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
  private guestOrigin: string | undefined;
  private guestRetryUntil = 0;
  private loadingPlans: Promise<void> | undefined;
  private loadingAmd: Promise<void> | undefined;
  private readonly modelRetryUntil = new Map<string, number>();
  private projection: Promise<void> = Promise.resolve();
  private modelRefreshedAt = 0;
  private quotaRevision = 0;
  private refreshedQuotaRevision = 0;
  private started = false;
  private stopped = false;
  private projectedCatalog: string | undefined;
  private writingCatalog = false;

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
    if (!this.identityKey) void this.refreshState('background').catch(() => {});
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
    this.guestOrigin = undefined;
    this.loadingAmd = undefined;
    this.modelRetryUntil.clear();
    this.modelRefreshedAt = 0;
    this.projectedCatalog = undefined;
    this.publish(key ? { ...EMPTY, phase: 'loading' } : EMPTY);
    this.project([], this.lifetime.signal);
    // Restore once when the cold-start account becomes available; repeated identity notifications
    // keep the same key. A newly signed-in account must load its own state as well.
    void this.refreshState('background').catch(() => {});
  }

  readonly refresh: CloudModule['refresh'] = (mode = 'manual') => {
    if (mode === 'manual') return this.refreshState('manual');
    if (
      !this.identityKey ||
      (mode === 'if-stale' &&
        this.refreshedQuotaRevision === this.quotaRevision &&
        !this.needsModelRefresh())
    )
      return Promise.resolve();
    return this.refreshState('background');
  };

  readonly refreshProvider = async (): Promise<void> => {
    if (!this.started || this.stopped) return;
    if (!this.identityKey) return this.refresh();
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

  private async loadGuestCatalog(signal: AbortSignal): Promise<void> {
    if (this.snapshot.guestCatalog !== 'ready')
      this.publish({ ...EMPTY, guestCatalog: 'loading', isRefreshing: this.snapshot.isRefreshing });
    try {
      if (this.guestRetryUntil > Date.now())
        throw new CloudGatewayRequestError(429, 'RATE_LIMITED');
      const apiOrigin = await this.source?.getGuestCatalogOrigin?.(signal);
      signal.throwIfAborted();
      const config = CloudServiceConfigSchema.safeParse({ apiOrigin });
      if (!config.success) throw new CloudAccessError('unavailable');
      const origin = config.data.apiOrigin;
      const path = MODEL_CATALOG_PATH;
      const headers = await cloudClientSignatureHeaders('GET', path, '');
      signal.throwIfAborted();
      if (!headers['X-Signature']) throw new CloudAccessError('unavailable');
      const http = createHttpClient({
        serviceName: 'CloudRuntime',
        operation: 'cloud.guestCatalog',
        baseUrl: origin,
        timeoutMs: 20_000,
      });
      const { data } = await http.request({
        method: 'GET',
        path,
        headers,
        signal,
        credentials: 'omit',
        redirect: 'error',
        maxResponseBytes: 2 * 1024 * 1024,
      });
      signal.throwIfAborted();
      const { data: models } = CloudModelCatalogSchema.parse(data);
      const next: CloudState = { ...EMPTY, guestCatalog: 'ready', models };
      await this.project(
        models.filter((model) => isCloudModelListed(next, model.id)),
        signal,
        origin,
      );
      signal.throwIfAborted();
      this.guestOrigin = origin;
      this.modelRefreshedAt = Date.now();
      this.publish(next);
    } catch (error) {
      signal.throwIfAborted();
      const http429 = isHttpError(error) && error.status === 429;
      if (http429) this.rememberGuestRateLimit(error.retryAfter ?? null);
      if (
        (http429 || (error instanceof CloudGatewayRequestError && error.statusCode === 429)) &&
        this.snapshot.guestCatalog === 'ready' &&
        this.guestOrigin
      ) {
        this.publish({ ...this.snapshot, isRefreshing: false });
        throw error;
      }
      this.guestOrigin = undefined;
      this.modelRefreshedAt = 0;
      this.publish({ ...EMPTY, guestCatalog: 'error' });
      await this.project([], signal);
      throw error;
    }
  }

  private rememberGuestRateLimit(retryAfter: string | null): void {
    this.guestRetryUntil = Math.max(
      this.guestRetryUntil,
      cloudRetryDeadline(retryAfter, Date.now()),
    );
  }

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

  readonly createActivationEntry = async (modelId: string): Promise<string> => {
    const session = this.session;
    const amd = this.snapshot.amd;
    const model = this.snapshot.models.find((item) => item.id === modelId);
    if (
      !session ||
      !model ||
      this.snapshot.phase !== 'ready' ||
      this.snapshot.account?.account.status !== 'active'
    )
      throw new CloudAccessError('unavailable');
    const use = supportsCloudModelUse(model, 'agent') ? 'agent' : 'general';
    const reason = cloudModelUnavailable(this.snapshot, modelId, use);
    if (reason && reason !== 'activation_required') throw new CloudAccessError(reason);
    if (isCloudAmdModel(model)) {
      if (amd?.phase !== 'ready') throw new CloudAccessError('unavailable');
      const { activated, action } = amd.status;
      if (!activated && action !== 'register' && action !== 'login' && action !== 'continue')
        throw new CloudAccessError('unavailable');
    } else if (!model.activation_required) throw new CloudAccessError('unavailable');
    const path = cloudActivationPath(model.activation_endpoint, session.origin);
    const { signal } = this.lifetime;
    try {
      return readCloudActivationEntry(await session.postEmpty(path));
    } catch (error) {
      if (!signal.aborted) this.reportSessionIssue(error);
      throw error;
    }
  };

  private async loadAmd(signal: AbortSignal): Promise<void> {
    if (!this.snapshot.amd || this.snapshot.amd.phase === 'error')
      this.publish({ ...this.snapshot, amd: { phase: 'loading' } });
    try {
      if (!this.session || this.snapshot.phase === 'loading') await this.refreshState('admission');
      signal.throwIfAborted();
      const session = this.session;
      if (!session) throw new CloudAccessError('unavailable');
      const status = CloudAmdStatusSchema.parse(await session.get(CLOUD_AMD_STATUS_PATH));
      signal.throwIfAborted();
      this.publish({ ...this.snapshot, amd: { phase: 'ready', status } });
    } catch (error) {
      if (signal.aborted) return;
      this.reportSessionIssue(error);
      const unsupported = isHttpError(error) && error.status === 404;
      this.publish({ ...this.snapshot, amd: { phase: unsupported ? 'unsupported' : 'error' } });
    }
  }

  private reportSessionIssue(error: unknown) {
    if (!isHttpError(error)) return undefined;
    const issue = cloudSessionIssue(error.status, error.code);
    if (issue)
      this.publish({ ...this.snapshot, phase: 'error', accountIssue: issue, isRefreshing: false });
    return issue;
  }

  private needsModelRefresh(): boolean {
    const ready = this.identityKey
      ? this.snapshot.phase === 'ready'
      : this.snapshot.guestCatalog === 'ready';
    return !ready || Date.now() - this.modelRefreshedAt > 30_000;
  }

  private async refreshState(mode: 'background' | 'manual' | 'admission'): Promise<void> {
    if (!this.started || this.stopped) return;
    const current = this.lifetime.signal;
    if (mode !== 'background') this.publish({ ...this.snapshot, isRefreshing: true });
    if (!this.refreshing) {
      const read = this.identityKey ? this.load(current, mode) : this.loadGuestCatalog(current);
      const attempt = read.finally(() => {
        if (this.refreshing === attempt) this.refreshing = undefined;
      });
      this.refreshing = attempt;
    }
    try {
      await this.refreshing;
    } catch (error) {
      const accessFailure =
        error instanceof CloudAccessError ||
        (isHttpError(error) && (error.status === 401 || error.status === 403));
      if (
        this.identityKey &&
        !current.aborted &&
        (mode !== 'background' || this.snapshot.phase !== 'ready' || accessFailure) &&
        !this.reportSessionIssue(error)
      )
        this.publish({ ...this.snapshot, phase: 'error', isRefreshing: false });
      throw error;
    }
    current.throwIfAborted();
    if (mode !== 'admission' && this.session && this.snapshot.account?.account.status === 'active')
      this.refreshPlans(this.session, current);
  }

  private async load(
    signal: AbortSignal,
    mode: 'manual' | 'background' | 'admission',
  ): Promise<void> {
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
    const quotaRevision = this.quotaRevision;
    const [accountRead, catalogRead] = await Promise.allSettled([
      session.get('/api/v1/account'),
      session.get(MODEL_CATALOG_PATH),
    ]);
    signal.throwIfAborted();
    if (catalogRead.status === 'rejected') {
      if (
        accountRead.status === 'rejected' &&
        isHttpError(accountRead.reason) &&
        accountRead.reason.status === 401
      )
        throw accountRead.reason;
      throw catalogRead.reason;
    }
    const { data: models } = CloudModelCatalogSchema.parse(catalogRead.value);
    if (accountRead.status === 'rejected') {
      if (mode !== 'background' || this.snapshot.phase !== 'ready') {
        // The signed directory remains browsable while personal admission is unavailable.
        this.publish({ ...this.snapshot, phase: 'error', models, isRefreshing: false });
      }
      throw accountRead.reason;
    }
    const account = CloudAccountSchema.parse(accountRead.value);
    if (account.account.id !== identity.profileId) throw new CloudAccessError('unavailable');
    const checkedAt = Date.now();
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
    this.modelRefreshedAt = checkedAt;
    this.refreshedQuotaRevision = quotaRevision;
    this.publish({
      ...next,
      plans: this.snapshot.plans,
      amd: this.snapshot.amd,
    });
  }

  /** Plan descriptions and sidebar metadata can load after account and model admission. */
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
        this.reportSessionIssue(error);
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
      if (identityKey !== this.identityKey || this.stopped || !this.started)
        throw new CloudAccessError('signed_out');
      if (!identityKey && this.guestRetryUntil > Date.now())
        throw new CloudGatewayRequestError(429, 'RATE_LIMITED');
      if ((this.modelRetryUntil.get(modelId) ?? 0) > Date.now())
        throw new CloudGatewayRequestError(429, 'RATE_LIMITED');
      if (this.needsModelRefresh()) {
        try {
          // Sending revalidates account/model admission without refreshing badge metadata.
          await this.refreshState('admission');
        } catch (error) {
          lifetime.throwIfAborted();
          if (
            !identityKey &&
            (this.guestRetryUntil > Date.now() || (isHttpError(error) && error.status === 429))
          )
            throw new CloudGatewayRequestError(429, 'RATE_LIMITED');
          throw new CloudAccessError(this.snapshot.accountIssue ?? 'unavailable');
        }
      }
      lifetime.throwIfAborted();
      const reason = cloudModelUnavailable(this.snapshot, modelId, use);
      if (reason) throw new CloudAccessError(reason);
      const session = this.session;
      const origin = identityKey ? session?.origin : this.guestOrigin;
      if (!origin || (identityKey && !session)) throw new CloudAccessError('unavailable');
      const request = new Request(input, init);
      const url = new URL(request.url);
      const model = this.snapshot.models.find((entry) => entry.id === modelId)!;
      const path =
        model.endpoint_type === 'anthropic-messages' ? '/v1/messages' : '/v1/chat/completions';
      // Pi's Anthropic SDK adds this marker; Cloud signs and serves the canonical messages route.
      if (model.endpoint_type === 'anthropic-messages' && url.search === '?beta=true')
        url.search = '';
      if (
        url.origin !== origin ||
        url.username ||
        url.password ||
        url.pathname !== path ||
        url.search ||
        url.hash ||
        request.method !== 'POST'
      )
        throw new CloudAccessError('unavailable');
      const body = await request.text();
      if ((JSON.parse(body) as { model?: unknown }).model !== modelId)
        throw new CloudAccessError('not_entitled');
      const controller = new AbortController();
      const linked = linkAbortSignals([lifetime, request.signal, controller.signal]);
      let completed = false;
      const complete = () => {
        if (completed) return;
        completed = true;
        linked.dispose();
        if (session && !lifetime.aborted) this.quotaRevision++;
      };
      try {
        const idempotencyKey = session ? createCloudIdempotencyKey() : undefined;
        const send = async () => {
          const signed = session
            ? await session.headers('POST', path, body, idempotencyKey)
            : await cloudClientSignatureHeaders('POST', path, body);
          linked.signal.throwIfAborted();
          if (!session && (!signed['X-Signature'] || origin !== this.guestOrigin))
            throw new CloudAccessError('unavailable');
          const currentModel = this.snapshot.models.find((item) => item.id === modelId);
          if (currentModel?.endpoint_type !== model.endpoint_type)
            throw new CloudAccessError('unavailable');
          const currentReason = cloudModelUnavailable(this.snapshot, modelId, use);
          if (currentReason) throw new CloudAccessError(currentReason);
          const headers = new Headers(signed);
          headers.set('content-type', 'application/json');
          // Only protocol headers cross this boundary; SDK keys and arbitrary extra headers do not.
          const anthropicVersion = request.headers.get('anthropic-version');
          if (anthropicVersion) headers.set('anthropic-version', anthropicVersion);
          const timer = setTimeout(() => {
            controller.abort(
              Object.assign(new Error('Cloud response headers timed out after 60 seconds.'), {
                name: 'TimeoutError',
                code: 'cloud_response_headers_timeout',
                retryable: true,
                timeoutMs: MODEL_RESPONSE_HEADERS_TIMEOUT_MS,
              }),
            );
          }, MODEL_RESPONSE_HEADERS_TIMEOUT_MS);
          try {
            const response = await raceAbort(
              expoFetch(url.toString(), {
                method: 'POST',
                headers,
                body,
                signal: linked.signal,
                credentials: 'omit',
                redirect: 'error',
              }),
              linked.signal,
            );
            return { response, authorization: signed.authorization };
          } finally {
            // Only waiting for headers is bounded here; Pi owns idle time during the body.
            clearTimeout(timer);
          }
        };
        const response = await this.sendModel(modelId, session, linked.signal, send);
        linked.signal.throwIfAborted();
        if (!response.ok) {
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
        const issue = session && !lifetime.aborted && this.reportSessionIssue(error);
        if (issue) throw new CloudAccessError(issue);
        throw error;
      }
    };
  }

  private async sendModel(
    modelId: string,
    session: CloudSession | undefined,
    signal: AbortSignal,
    send: () => Promise<{ response: Response; authorization?: string }>,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const { response, authorization } = await send();
      signal.throwIfAborted();
      if (response.ok) return response;
      // Preserve the original error response for the protocol SDK when the gateway forwards an upstream error.
      const payload = await response
        .clone()
        .json()
        .catch(() => undefined);
      const code = readCloudGatewayCode(payload);
      signal.throwIfAborted();
      if (attempt === 0 && session?.recoverRequest(response.status, code, authorization)) {
        await response.body?.cancel().catch(() => {});
        continue;
      }
      const { status } = response;
      if (status === 429) {
        const retryAfter = response.headers.get('retry-after');
        if (session)
          this.modelRetryUntil.set(
            modelId,
            Math.max(
              this.modelRetryUntil.get(modelId) ?? 0,
              cloudRetryDeadline(retryAfter, Date.now()),
            ),
          );
        else this.rememberGuestRateLimit(retryAfter);
      }
      const accountIssue = session && code && cloudSessionIssue(status, code);
      if (accountIssue) this.publish({ ...this.snapshot, phase: 'error', accountIssue });
      if (session && (code === 'AMD_CREDENTIAL_INVALID' || code === 'AMD_ACTIVATION_REQUIRED'))
        void this.refreshAmd();
      if (
        code === 'MODEL_UNAVAILABLE' ||
        code === 'ENTITLEMENT_INACTIVE' ||
        code === 'AMD_CREDENTIAL_INVALID' ||
        code === 'AMD_ACTIVATION_REQUIRED'
      )
        void this.refreshState('admission').catch(() => {});
      if (!code && status !== 429 && (session || status !== 401)) return response;
      await response.body?.cancel().catch(() => {});
      const failureCode =
        !session && status === 401 ? 'cloud_unavailable' : (code ?? 'RATE_LIMITED');
      throw new CloudGatewayRequestError(
        status,
        failureCode,
        readGatewayRequestId(response.headers),
        !code && status === 429 ? readCloudUpstreamErrorBody(payload) : undefined,
      );
    }
  }

  private project(
    models: CloudState['models'],
    signal: AbortSignal,
    origin = this.configuration?.apiOrigin ?? null,
  ): Promise<void> {
    const catalog = JSON.stringify([origin, models]);
    const assertWritable = () => {
      signal.throwIfAborted();
      storageMutationGate.assertWritable();
    };
    const work = this.projection
      .catch(() => {})
      .then(async () => {
        signal.throwIfAborted();
        if (this.projectedCatalog === catalog) return;
        while (storageMutationGate.isFrozen) await storageMutationGate.waitUntilWritable(signal);
        signal.throwIfAborted();
        this.writingCatalog = true;
        try {
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
        } finally {
          this.writingCatalog = false;
        }
      });
    this.projection = work;
    // Identity changes cannot await storage; requests are already revoked synchronously.
    void work.catch(() => {});
    return work;
  }

  hasPendingStorageWork(): boolean {
    return this.writingCatalog;
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
