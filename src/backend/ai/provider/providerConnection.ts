import {
  getExtraHeaders,
  resolveEffectiveEndpoint,
  resolveWireModelId,
  type ResolvedEndpoint,
} from '@cherrystudio/ai-runtime/provider';
import type { EndpointType } from '@cherrystudio/provider-registry';

import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

export interface ResolvedProviderConnection {
  adapterFamily: string | undefined;
  baseUrl: string;
  endpointType: EndpointType | undefined;
  headers: Record<string, string>;
  providerOptionsKey: string | undefined;
  wireModelId: string;
}

interface ResolveProviderConnectionOptions {
  resolvedEndpoint?: ResolvedEndpoint;
}

/**
 * Resolve the Provider connection facts shared by capability executors.
 *
 * Selected API keys and IAM/OAuth credentials deliberately stay out of this
 * value. Provider-configured extra headers can still contain sensitive values,
 * so the result is ephemeral and must not be persisted or logged. The owning
 * request or Runtime connection materializes credentials exactly once so key
 * rotation and usage attribution cannot drift between consumers.
 */
export function resolveProviderConnection(
  provider: Provider,
  model: Model,
  options: ResolveProviderConnectionOptions = {},
): ResolvedProviderConnection {
  const resolvedEndpoint = options.resolvedEndpoint ?? resolveEffectiveEndpoint(provider, model);
  const { endpointType } = resolvedEndpoint;

  return {
    adapterFamily: endpointType
      ? provider.endpointConfigs?.[endpointType]?.adapterFamily
      : undefined,
    baseUrl: resolvedEndpoint.baseUrl,
    endpointType,
    headers: { ...defaultAppHeaders(), ...getExtraHeaders(provider) },
    providerOptionsKey: resolvedEndpoint.providerOptionsKey,
    wireModelId: resolveWireModelId(model, endpointType),
  };
}
