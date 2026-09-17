import {
  formatApiHost,
  isWithTrailingSharp,
  routeToEndpoint,
} from '@cherrystudio/ai-runtime/provider';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';
import type { AuthConfig, Provider } from '@/shared/data/types/provider';

import {
  resolveProviderConnection,
  shouldAppendProviderApiVersion,
} from '../provider/providerConnection';

/** A deliberately small protocol surface; never infer support from a provider's display name. */
export function resolveNativeTranslationConnection(
  provider: Provider,
  model: Model,
  auth: AuthConfig | null,
): { endpoint: string; wireModelId: string } | null {
  const connection = resolveProviderConnection(provider, model);
  if (
    connection.endpointType !== ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS ||
    !['openai', 'openai-compatible'].includes(connection.adapterFamily ?? 'openai-compatible') ||
    provider.authType !== 'api-key' ||
    (auth && auth.type !== 'api-key') ||
    (auth?.type === 'api-key' &&
      auth.headerName &&
      auth.headerName.toLowerCase() !== 'authorization') ||
    (auth?.type === 'api-key' && auth.prefix !== undefined && auth.prefix.trim() !== 'Bearer') ||
    Object.keys(provider.settings.extraHeaders ?? {}).length > 0 ||
    provider.settings.serviceTier != null ||
    provider.settings.verbosity != null
  ) {
    return null;
  }
  const formatted = formatApiHost(
    connection.baseUrl,
    shouldAppendProviderApiVersion(provider) && !isWithTrailingSharp(connection.baseUrl),
  );
  const { baseURL, endpoint } = routeToEndpoint(formatted);
  if (endpoint && endpoint !== 'chat/completions') return null;
  try {
    const url = new URL(`${baseURL}/chat/completions`);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      return null;
    return { endpoint: url.toString(), wireModelId: connection.wireModelId };
  } catch {
    return null;
  }
}
