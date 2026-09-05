import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { JSONValue } from 'ai';

import { buildVendorProviderOptions } from '../provider/custom/wire/buildImageRequest';
import { DEFAULT_DIFFUSION_REGISTRATION, WIRE_REGISTRY } from '../provider/custom/wire/wireProfile';

export function buildImageProviderOptions({
  aiSdkProviderId,
  paramValues,
  provider,
  vendorBag,
}: {
  aiSdkProviderId: string;
  paramValues: Record<string, unknown>;
  provider: Provider;
  vendorBag: Record<string, unknown>;
}): Record<string, Record<string, JSONValue>> {
  const providerIdentity = provider.presetProviderId ?? provider.id;
  const registration =
    WIRE_REGISTRY[providerIdentity] ??
    WIRE_REGISTRY[aiSdkProviderId] ??
    DEFAULT_DIFFUSION_REGISTRATION;
  const deliveryProviderId =
    aiSdkProviderId === 'openai-compatible' ? provider.id : aiSdkProviderId;
  return buildVendorProviderOptions(deliveryProviderId, paramValues, registration, vendorBag);
}

export function mergeImageProviderOptions(
  existing: ProviderOptions | undefined,
  imageOptions: Record<string, Record<string, JSONValue>>,
): ProviderOptions | undefined {
  const providerIds = new Set([...Object.keys(existing ?? {}), ...Object.keys(imageOptions)]);
  if (providerIds.size === 0) {
    return undefined;
  }

  const merged: Record<string, Record<string, JSONValue>> = {};
  for (const providerId of providerIds) {
    merged[providerId] = deepMerge(
      (existing?.[providerId] ?? {}) as Record<string, JSONValue>,
      imageOptions[providerId] ?? {},
    );
  }
  return merged;
}

function deepMerge(
  target: Record<string, JSONValue>,
  source: Record<string, JSONValue>,
): Record<string, JSONValue> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] =
      isPlainObject(value) && isPlainObject(result[key]) ? deepMerge(result[key], value) : value;
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, JSONValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
