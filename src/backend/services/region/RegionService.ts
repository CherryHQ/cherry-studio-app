import { loggerService } from '@logger';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
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

import {
  configOrigin,
  NetworkRegionSchema,
  requestConfigServiceResolve,
  type NetworkRegion,
} from './configServiceResolve';

const logger = loggerService.withContext('RegionService');
const CACHE_KEY = 'region.egress_region';
const CACHE_TTL = 10 * 60 * 1_000;
const ResolveRegionSchema = z.object({ region: NetworkRegionSchema });

/** Shared egress detection via Config Service, independent of data-collection consent. */
@Injectable('RegionService')
@DependsOn(['CacheService'])
@ServicePhase(Phase.Gate)
@AppStatePolicy('not-applicable')
export class RegionService extends BaseService {
  private inflight: Promise<NetworkRegion | null> | undefined;
  private readonly controller = new AbortController();

  protected override onInit(signal?: AbortSignal): void {
    const abort = () => this.controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    this.registerDisposable(() => signal?.removeEventListener('abort', abort));
    if (signal?.aborted) abort();
  }

  /** Resolves the cached or freshly detected egress region (`CN` or `GLOBAL`), or `null` when unavailable. */
  getRegion(): Promise<NetworkRegion | null> {
    this.controller.signal.throwIfAborted();
    const cached = application.get('CacheService').get(CACHE_KEY);
    if (cached) return Promise.resolve(cached);

    this.inflight ??= this.detectRegion().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  private async detectRegion(): Promise<NetworkRegion | null> {
    const origin = configOrigin(Constants.expoConfig?.extra?.configServiceOrigin);
    const platform = Platform.OS;
    if (!origin || (platform !== 'ios' && platform !== 'android')) return null;

    const cache = application.get('CacheService');
    const { signal } = this.controller;
    try {
      const { data, status } = await requestConfigServiceResolve(origin, platform, {
        signal,
        timeoutMs: 5_000,
      });
      if (status !== 200) {
        throw new Error(`Unexpected Config Service status: ${status}`);
      }
      signal.throwIfAborted();
      const { region } = ResolveRegionSchema.parse(data);
      cache.set(CACHE_KEY, region, CACHE_TTL);
      return region;
    } catch (error) {
      signal.throwIfAborted();
      logger.warn('Config Service region unavailable; keeping the region unknown', { error });
      return null;
    }
  }

  protected override async onStop(): Promise<void> {
    this.controller.abort();
    await this.inflight?.catch(() => {});
  }
}
