import { getBaseUrl } from '@cherrystudio/ai-runtime/provider';

import { providerService } from '@/backend/data/services/ProviderService';
import type { Provider } from '@/shared/data/types/provider';
import { sha256HexOfText } from '@/shared/utils/sha256';

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
  try {
    const provider = await getDeepseekProvider();
    deepseekServiceBaseUrl(getBaseUrl(provider));
    const { keys } = await providerService.listApiKeys(provider.id, { enabled: true });
    signal.throwIfAborted();
    return keys.some((key) => key.key.trim());
  } catch {
    signal.throwIfAborted();
    return false;
  }
}

/** The model provider owns enabled credentials and addresses for every DeepSeek capability. */
async function getDeepseekProvider(): Promise<Provider> {
  const provider = await providerService.getByProviderId('deepseek');
  if (!provider.isEnabled || provider.authType !== 'api-key')
    throw new DeepseekServiceError('not-configured');
  return provider;
}

export function deepseekServiceBaseUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new DeepseekServiceError('not-configured');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new DeepseekServiceError('not-configured');
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/(?:anthropic(?:\/v1)?|v1)$/, '');
  return url.toString().replace(/\/+$/, '');
}

export async function resolveDeepseekConnection(signal: AbortSignal): Promise<DeepseekConnection> {
  signal.throwIfAborted();
  const provider = await getDeepseekProvider();
  const selected = await providerService.resolveApiKey(provider.id);
  signal.throwIfAborted();
  return createDeepseekConnection(provider.id, getBaseUrl(provider), selected.value);
}

/** Also used by the Pi binding with the exact credential serving that model attempt. */
export function createDeepseekConnection(
  providerId: string,
  apiHost: string,
  apiKey: string,
): DeepseekConnection {
  if (providerId !== 'deepseek' || !apiKey.trim()) throw new DeepseekServiceError('not-configured');
  const baseUrl = deepseekServiceBaseUrl(apiHost);
  return {
    providerId,
    baseUrl,
    headers: { Authorization: `Bearer ${apiKey}` },
    scope: sha256HexOfText(`${providerId}\n${baseUrl}\n${apiKey}`),
  };
}
