import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { JSONValue } from 'ai';

import { hasImageTransport } from '../provider/custom/imageTransportRegistry';
import { isMinimaxH3ImageModel } from '../provider/custom/minimax/minimaxH3Image';
import { buildVendorProviderOptions } from '../provider/custom/wire/buildImageRequest';
import {
  DEFAULT_DIFFUSION_REGISTRATION,
  MINIMAX_H3_REGISTRATION,
  WIRE_REGISTRY,
} from '../provider/custom/wire/wireProfile';

export function buildImageProviderOptions({
  aiSdkProviderId,
  modelId,
  paramValues,
  provider,
  vendorBag,
  requestTimeoutMs,
}: {
  aiSdkProviderId: string;
  modelId: string;
  paramValues: Record<string, unknown>;
  provider: Provider;
  vendorBag: Record<string, unknown>;
  requestTimeoutMs?: number;
}): Record<string, Record<string, JSONValue>> {
  // Custom transports own the final wire format and consume canonical parameters.
  if (hasImageTransport(aiSdkProviderId, modelId)) {
    return {
      [aiSdkProviderId]: {
        ...vendorBag,
        ...(requestTimeoutMs !== undefined && { requestTimeoutMs }),
      } as Record<string, JSONValue>,
    };
  }
  const providerIdentity = provider.presetProviderId ?? provider.id;
  const registration =
    aiSdkProviderId === 'minimax' && isMinimaxH3ImageModel(modelId)
      ? MINIMAX_H3_REGISTRATION
      : (WIRE_REGISTRY[aiSdkProviderId] ??
        WIRE_REGISTRY[providerIdentity] ??
        DEFAULT_DIFFUSION_REGISTRATION);
  const deliveryProviderId =
    aiSdkProviderId === 'openai-compatible' ? provider.id : aiSdkProviderId;
  return buildVendorProviderOptions(deliveryProviderId, paramValues, registration, vendorBag);
}
