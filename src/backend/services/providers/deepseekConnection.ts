import { providerService } from '@/backend/data/services/ProviderService';
import {
  DEFAULT_DEEPSEEK_SERVICES,
  DeepseekServicesSchema,
  type DeepseekServices,
} from '@/shared/contracts/deepseek';
import { sha256HexOfText } from '@/shared/utils/sha256';

let configuration = (): DeepseekServices => DEFAULT_DEEPSEEK_SERVICES;

/** Composition supplies live preferences; callers never retain a secret-bearing connection. */
export function configureDeepseekServices(read: () => DeepseekServices): void {
  configuration = read;
}

export function getDeepseekServices(): DeepseekServices {
  return DeepseekServicesSchema.parse(configuration());
}

export class DeepseekServiceError extends Error {
  constructor(readonly code: 'not-configured' | 'invalid-response' | 'limit' | 'failed') {
    super(`DeepSeek service ${code}.`);
    this.name = 'DeepseekServiceError';
  }
}

export type DeepseekConnection = {
  providerId: string;
  baseUrl: string;
  headers: Record<string, string>;
  /** Non-secret cache identity; different keys are isolated unless account identity is known. */
  scope: string;
};

export async function isDeepseekConfigured(signal: AbortSignal): Promise<boolean> {
  const { providerId } = getDeepseekServices();
  if (!providerId) return false;
  try {
    const provider = await providerService.getByProviderId(providerId);
    const { keys } = await providerService.listApiKeys(providerId, { enabled: true });
    signal.throwIfAborted();
    return (
      provider.isEnabled && provider.authType === 'api-key' && keys.some((key) => key.key.trim())
    );
  } catch {
    signal.throwIfAborted();
    return false;
  }
}

export async function resolveDeepseekConnection(
  signal: AbortSignal,
  settings = getDeepseekServices(),
): Promise<DeepseekConnection> {
  signal.throwIfAborted();
  const { providerId } = settings;
  if (!providerId) throw new DeepseekServiceError('not-configured');
  const provider = await providerService.getByProviderId(providerId);
  if (!provider.isEnabled || provider.authType !== 'api-key')
    throw new DeepseekServiceError('not-configured');
  const selected = await providerService.resolveApiKey(providerId);
  signal.throwIfAborted();
  return createDeepseekConnection(settings, selected.value);
}

/** Also used by the Pi binding with the exact credential serving that model attempt. */
export function createDeepseekConnection(
  settings: DeepseekServices,
  apiKey: string,
): DeepseekConnection {
  const { providerId } = settings;
  const host = DeepseekServicesSchema.shape.apiHost.safeParse(settings.apiHost);
  if (!providerId || !apiKey.trim() || !host.success)
    throw new DeepseekServiceError('not-configured');
  const baseUrl = host.data;
  return {
    providerId,
    baseUrl,
    headers: { Authorization: `Bearer ${apiKey}` },
    scope: sha256HexOfText(`${providerId}\n${baseUrl}\n${apiKey}`),
  };
}
