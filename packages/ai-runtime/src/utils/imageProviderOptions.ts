import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { JSONValue } from 'ai';

import { hasImageTransport } from '../provider/custom/imageTransportRegistry';
import { buildVendorProviderOptions } from '../provider/custom/wire/buildImageRequest';
import { DEFAULT_DIFFUSION_REGISTRATION, WIRE_REGISTRY } from '../provider/custom/wire/wireProfile';

export function buildImageProviderOptions({
  aiSdkProviderId,
  modelId,
  paramValues,
  provider,
  vendorBag,
}: {
  aiSdkProviderId: string;
  modelId: string;
  paramValues: Record<string, unknown>;
  provider: Provider;
  vendorBag: Record<string, unknown>;
}): Record<string, Record<string, JSONValue>> {
  // Custom transports own the final wire format and consume canonical parameters.
  if (hasImageTransport(aiSdkProviderId, modelId)) {
    return { [aiSdkProviderId]: vendorBag as Record<string, JSONValue> };
  }
  const providerIdentity = provider.presetProviderId ?? provider.id;
  const registration =
    WIRE_REGISTRY[aiSdkProviderId] ??
    WIRE_REGISTRY[providerIdentity] ??
    DEFAULT_DIFFUSION_REGISTRATION;
  const deliveryProviderId =
    aiSdkProviderId === 'openai-compatible' ? provider.id : aiSdkProviderId;
  return buildVendorProviderOptions(deliveryProviderId, paramValues, registration, vendorBag);
}
