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

const logger = loggerService.withContext('RegionService');
const CACHE_KEY = 'region.egress_country';
const CACHE_TTL = 10 * 60 * 1_000;
const DEFAULT_COUNTRY = 'CN';
// Public project credential shared with Cherry Desktop's Lite integration.
const IPINFO_TOKEN = '5aa4105b40adbc';
const CountrySchema = z.string().regex(/^[A-Z]{2}$/);
const IpRegionSchema = z.object({ country_code: CountrySchema });
const ipinfo = createHttpClient({ baseUrl: 'https://api.ipinfo.io', timeoutMs: 5_000 });

/** Shared egress-country detection with Desktop's success-cache and CN fallback policy. */
@Injectable('RegionService')
@DependsOn(['CacheService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('not-applicable')
export class RegionService extends BaseService {
  private inflight: Promise<string> | undefined;
  private readonly controller = new AbortController();

  protected onInit(signal?: AbortSignal): void {
    const abort = () => this.controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    this.registerDisposable(() => signal?.removeEventListener('abort', abort));
    if (signal?.aborted) {
      abort();
      return;
    }
  }

  getCountry(): Promise<string> {
    this.controller.signal.throwIfAborted();
    const cached = application.get('CacheService').get(CACHE_KEY);
    if (cached) return Promise.resolve(cached);

    this.inflight ??= this.detectCountry().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async detectCountry(): Promise<string> {
    const cache = application.get('CacheService');
    const { signal } = this.controller;
    try {
      const { data } = await ipinfo.request<unknown>({
        method: 'GET',
        path: '/lite/me',
        query: { token: IPINFO_TOKEN },
        maxResponseBytes: 4_096,
        signal,
      });
      signal.throwIfAborted();
      const { country_code: country } = IpRegionSchema.parse(data);
      cache.set(CACHE_KEY, country, CACHE_TTL);
      return country;
    } catch (error) {
      signal.throwIfAborted();
      logger.warn('IP region unavailable; using the CN default', error);
      return DEFAULT_COUNTRY;
    }
  }

  protected async onStop(): Promise<void> {
    this.controller.abort();
    await this.inflight?.catch(() => {});
  }
}
