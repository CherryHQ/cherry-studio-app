import { loggerService } from '@/core/logger/LoggerService';
import type { UpdateProviderInput } from '@/data/services/ProviderService';
import type { Provider } from '@/shared/domain/provider';

const logger = loggerService.withContext('ProviderScreen:EnableProviderWhenModelsAvailable');

/**
 * Enables a disabled provider once a flow has confirmed it has usable models.
 * Best-effort: a failure here must not fail the caller's primary operation
 * (model check/pull/sync already succeeded by the time this runs).
 */
export async function enableProviderWhenModelsAvailable(
  provider: Pick<Provider, 'id' | 'isEnabled'> | undefined,
  updateProvider: (updates: UpdateProviderInput) => Promise<unknown>,
  modelCount: number,
  source: string,
): Promise<boolean> {
  if (!provider || provider.isEnabled || modelCount <= 0) {
    return false;
  }

  try {
    await updateProvider({ isEnabled: true });
    return true;
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to enable provider when models are available', normalizedError, {
      modelCount,
      providerId: provider.id,
      source,
    });
    return false;
  }
}
