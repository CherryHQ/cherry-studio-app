import { loggerService } from '@logger';
import { z } from 'zod';

import { application } from '@/backend/core/application/Application';
import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { createHttpClient } from '@/backend/services/http';
import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  isDataCollectionConsented,
  LATEST_PRIVACY_POLICY_VERSION,
} from '@/shared/utils/privacyConsent';

const logger = loggerService.withContext('RegionService');
const CACHE_KEY = 'region.egress_country';
const CACHE_TTL = 10 * 60 * 1_000;
const CONSENT_KEYS = {
  enabled: 'app.privacy.data_collection.enabled',
  version: 'app.privacy.policy_version',
} as const;
// Public project credential shared with Cherry Desktop's Lite integration.
const IPINFO_TOKEN = '5aa4105b40adbc';
const CountrySchema = z.string().regex(/^[A-Z]{2}$/);
const IpRegionSchema = z.object({ country_code: CountrySchema });
const ipinfo = createHttpClient({ baseUrl: 'https://api.ipinfo.io', timeoutMs: 5_000 });

/** Consent-gated egress detection; unavailable detection never asserts a country. */
@Injectable('RegionService')
@DependsOn(['CacheService', 'PreferenceService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('not-applicable')
export class RegionService extends BaseService {
  private inflight: Promise<string | null> | undefined;
  private readonly controller = new AbortController();
  private requestController: AbortController | undefined;

  protected onInit(signal?: AbortSignal): void {
    const abort = () => this.controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    this.registerDisposable(() => signal?.removeEventListener('abort', abort));
    if (signal?.aborted) {
      abort();
      return;
    }
    const preferences = application.get('PreferenceService');
    for (const key of Object.values(CONSENT_KEYS)) {
      this.registerDisposable(
        preferences.subscribeChange(key)(() => {
          if (!this.isConsented()) {
            this.requestController?.abort();
            application.get('CacheService').delete(CACHE_KEY);
          }
        }),
      );
    }
  }

  getCountry(): Promise<string | null> {
    this.controller.signal.throwIfAborted();
    if (
      application.get('PreferenceService').getCachedValue(CONSENT_KEYS.version) !==
      LATEST_PRIVACY_POLICY_VERSION
    ) {
      return this.waitForConsentDecision().then(() => this.getCountry());
    }
    if (!this.isConsented()) return Promise.resolve(null);
    const cached = application.get('CacheService').get(CACHE_KEY);
    if (cached) return Promise.resolve(cached);

    this.inflight ??= this.detectCountry().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private waitForConsentDecision(): Promise<void> {
    const preferences = application.get('PreferenceService');
    const { signal } = this.controller;
    return new Promise((resolve, reject) => {
      const finish = () => {
        if (
          signal.aborted ||
          preferences.getCachedValue(CONSENT_KEYS.version) === LATEST_PRIVACY_POLICY_VERSION
        ) {
          unsubscribe();
          signal.removeEventListener('abort', finish);
          if (signal.aborted) reject(signal.reason);
          else resolve();
        }
      };
      const unsubscribe = preferences.subscribeChange(CONSENT_KEYS.version)(finish);
      signal.addEventListener('abort', finish, { once: true });
      finish();
    });
  }

  private isConsented(): boolean {
    const { enabled, version } = application
      .get('PreferenceService')
      .getMultipleCached(CONSENT_KEYS);
    return isDataCollectionConsented(enabled, version);
  }

  private async detectCountry(): Promise<string | null> {
    const cache = application.get('CacheService');
    const controller = new AbortController();
    this.requestController = controller;
    const linked = linkAbortSignals([this.controller.signal, controller.signal]);
    const { signal } = linked;
    try {
      const { data } = await ipinfo.request<unknown>({
        method: 'GET',
        path: '/lite/me',
        query: { token: IPINFO_TOKEN },
        maxResponseBytes: 4_096,
        signal,
      });
      signal.throwIfAborted();
      if (!this.isConsented()) return null;
      const { country_code: country } = IpRegionSchema.parse(data);
      cache.set(CACHE_KEY, country, CACHE_TTL);
      return country;
    } catch (error) {
      this.controller.signal.throwIfAborted();
      if (signal.aborted || !this.isConsented()) return null;
      logger.warn('IP region unavailable; keeping the country unknown', { error });
      return null;
    } finally {
      linked.dispose();
      if (this.requestController === controller) this.requestController = undefined;
    }
  }

  protected async onStop(): Promise<void> {
    this.controller.abort();
    await this.inflight?.catch(() => {});
  }
}
