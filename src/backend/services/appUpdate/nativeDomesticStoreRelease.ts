import { randomUUID } from 'expo-crypto';
import { z } from 'zod';

import type { AppUpdateResult, DomesticAppStore } from '@/shared/contracts/appUpdate';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getNativeAppUpdate } from '../../../../modules/app-update';

const logger = loggerService.withContext('DomesticStoreUpdate');
const ResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('upToDate') }),
  z.object({
    status: z.literal('unavailable'),
    reason: z.string().max(100),
    vendorCode: z.number().int().nullish(),
  }),
  z.object({
    status: z.literal('available'),
    versionCode: z.number().int().positive().max(2_100_000_000),
    versionName: z.string().trim().max(100).nullable(),
    notes: z.string().max(32_000).nullable(),
  }),
]);

export async function checkNativeDomesticStoreRelease(
  store: Exclude<DomesticAppStore, 'oppo'>,
  packageName: string,
  currentVersion: string,
  currentBuild: number,
  signal: AbortSignal,
): Promise<AppUpdateResult> {
  signal.throwIfAborted();
  const native = getNativeAppUpdate();
  if (!native?.checkDomesticStoreUpdate || !native.cancelDomesticStoreUpdate) {
    return { status: 'unavailable', reason: 'nativeUnavailable' };
  }
  const id = randomUUID();
  const work = native.checkDomesticStoreUpdate(id, store);
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    cancellation ??= native.cancelDomesticStoreUpdate(id).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    const raw = await work;
    signal.throwIfAborted();
    const result = ResultSchema.parse(raw);
    if (result.status === 'upToDate') return { status: 'upToDate', currentVersion };
    if (result.status === 'unavailable') {
      logger.warn('Store update query is unavailable', {
        store,
        reason: result.reason,
        vendorCode: result.vendorCode,
      });
      throw new Error('Store update query failed');
    }
    if (result.versionCode <= currentBuild)
      throw new Error('Store update target is not a newer build');
    return {
      status: 'available',
      channel: 'domestic-stores',
      store,
      id: `domestic-stores:${packageName}:${store}:${result.versionCode}`,
      currentVersion,
      latestVersion: result.versionName || null,
      notesSource: 'store',
      notes: result.notes,
    };
  } catch (error) {
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    await cancellation;
  }
}
