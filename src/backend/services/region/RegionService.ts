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
const CountrySchema = z.string().regex(/^[A-Z]{2}$/);
const IpRegionSchema = z.object({ country: CountrySchema });
const ipinfo = createHttpClient({ baseUrl: 'https://ipinfo.io', timeoutMs: 5_000 });

/** One egress-country lookup per app generation, shared by discovery and distribution. */
@Injectable('RegionService')
@DependsOn(['CacheService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('not-applicable')
export class RegionService extends BaseService {
  private country: Promise<string> | undefined;
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
    this.country ??= this.detectCountry();
    return this.country;
  }

  private async detectCountry(): Promise<string> {
    const cache = application.get('CacheService');
    const { signal } = this.controller;
    try {
      const { data } = await ipinfo.request<unknown>({
        method: 'GET',
        path: '/json',
        maxResponseBytes: 4_096,
        signal,
      });
      signal.throwIfAborted();
      const { country } = IpRegionSchema.parse(data);
      cache.setPersist('region.last_country', country);
      return country;
    } catch (error) {
      signal.throwIfAborted();
      logger.warn('IP region unavailable; using the last country or the global default', error);
      const cached = CountrySchema.safeParse(cache.getPersist('region.last_country'));
      return cached.success ? cached.data : 'US';
    }
  }

  protected async onStop(): Promise<void> {
    this.controller.abort();
    await this.country?.catch(() => {});
  }
}
