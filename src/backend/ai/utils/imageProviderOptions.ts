import type { ProviderOptions } from '@ai-sdk/provider-utils';
import { type CanonicalParamKey, wireName } from '@cherrystudio/provider-registry';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import type { JSONValue } from 'ai';

import { normalizeAspectRatio } from './imageOptions';

type WireRule = {
  contribute?: (value: unknown, all: Record<string, unknown>) => Record<string, JSONValue>;
  map?: (value: unknown, all: Record<string, unknown>) => JSONValue;
  to?: string;
};

type WireProfile = {
  fields?: Partial<Record<CanonicalParamKey, WireRule>>;
  forward?: CanonicalParamKey[];
};

type WireRegistration = {
  also?: ReadonlyArray<{ key: string; profile: WireProfile }>;
  dualOpenAI?: boolean;
  key?: string;
  passthrough?: boolean;
  profile: WireProfile;
};

const DIFFUSION_WIRE_PROFILE: WireProfile = {
  forward: [
    'negativePrompt',
    'seed',
    'numInferenceSteps',
    'guidanceScale',
    'promptEnhancement',
    'quality',
  ],
};

const OPENAI_WIRE_PROFILE: WireProfile = {
  forward: ['quality', 'background', 'moderation', 'style'],
};

const AIHUBMIX_WIRE_PROFILE: WireProfile = {
  forward: [...(OPENAI_WIRE_PROFILE.forward ?? []), 'seed'],
};

const OPENROUTER_WIRE_PROFILE: WireProfile = {
  fields: {
    outputCompression: {
      contribute: (value, all): Record<string, JSONValue> => {
        if (all.outputFormat === 'jpeg' || all.outputFormat === 'webp') {
          return { output_compression: value as JSONValue };
        }
        return {};
      },
    },
  },
  forward: ['resolution', 'quality', 'outputFormat', 'background'],
};

const DASHSCOPE_WIRE_PROFILE: WireProfile = {
  forward: ['negativePrompt', 'seed', 'style'],
};

const aspectRatioImageConfigRule: WireRule = {
  contribute: (value): Record<string, JSONValue> => {
    const normalized = normalizeAspectRatio(String(value));
    if (normalized) {
      return { imageConfig: { aspectRatio: normalized } };
    }
    return {};
  },
};

const imageResolutionImageConfigRule: WireRule = {
  contribute: (value): Record<string, JSONValue> => {
    if (typeof value === 'string') {
      return { imageConfig: { imageSize: value } };
    }
    return {};
  },
};

const GOOGLE_WIRE_PROFILE: WireProfile = {
  fields: {
    aspectRatio: aspectRatioImageConfigRule,
    imageResolution: imageResolutionImageConfigRule,
    personGeneration: { map: (value) => String(value).toLowerCase(), to: 'personGeneration' },
    size: {
      contribute: (value) => ({ imageConfig: { imageSize: value as JSONValue } }),
    },
  },
};

const DMXAPI_WIRE_PROFILE: WireProfile = {
  forward: ['negativePrompt', 'seed', 'quality'],
};

const DMXAPI_GOOGLE_PROFILE: WireProfile = {
  fields: {
    aspectRatio: aspectRatioImageConfigRule,
    imageResolution: imageResolutionImageConfigRule,
  },
};

const OLLAMA_WIRE_PROFILE: WireProfile = {
  fields: {
    numInferenceSteps: { to: 'steps' },
  },
};

const WIRE_REGISTRY: Record<string, WireRegistration> = {
  aihubmix: { dualOpenAI: true, passthrough: true, profile: AIHUBMIX_WIRE_PROFILE },
  azure: { dualOpenAI: true, profile: OPENAI_WIRE_PROFILE },
  'azure-openai': { dualOpenAI: true, profile: OPENAI_WIRE_PROFILE },
  'azure-responses': { dualOpenAI: true, profile: OPENAI_WIRE_PROFILE },
  cherryin: {
    dualOpenAI: true,
    key: 'cherryin',
    passthrough: true,
    profile: OPENAI_WIRE_PROFILE,
  },
  'cherryin-chat': {
    dualOpenAI: true,
    key: 'cherryin',
    passthrough: true,
    profile: OPENAI_WIRE_PROFILE,
  },
  dashscope: { passthrough: true, profile: DASHSCOPE_WIRE_PROFILE },
  dmxapi: {
    also: [{ key: 'google', profile: DMXAPI_GOOGLE_PROFILE }],
    profile: DMXAPI_WIRE_PROFILE,
  },
  gemini: { profile: GOOGLE_WIRE_PROFILE },
  google: { profile: GOOGLE_WIRE_PROFILE },
  'google-vertex': { key: 'vertex', profile: GOOGLE_WIRE_PROFILE },
  huggingface: { dualOpenAI: true, profile: OPENAI_WIRE_PROFILE },
  newapi: { dualOpenAI: true, profile: OPENAI_WIRE_PROFILE },
  ollama: { profile: OLLAMA_WIRE_PROFILE },
  openai: { dualOpenAI: true, profile: OPENAI_WIRE_PROFILE },
  'openai-chat': { dualOpenAI: true, profile: OPENAI_WIRE_PROFILE },
  openrouter: { profile: OPENROUTER_WIRE_PROFILE },
  vertexai: { key: 'vertex', profile: GOOGLE_WIRE_PROFILE },
};

const DEFAULT_DIFFUSION_REGISTRATION: WireRegistration = {
  passthrough: true,
  profile: DIFFUSION_WIRE_PROFILE,
};

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

function buildVendorProviderOptions(
  providerId: string,
  paramValues: Record<string, unknown>,
  registration: WireRegistration,
  vendorBag: Record<string, unknown>,
): Record<string, Record<string, JSONValue>> {
  const mapped = buildImageRequest(paramValues, registration.profile);
  const extras = passthroughExtras(vendorBag, registration.profile);
  const body = registration.passthrough ? { ...jsonBag(extras), ...mapped } : mapped;
  const result: Record<string, Record<string, JSONValue>> = {};

  if (Object.keys(body).length > 0) {
    result[registration.key ?? providerId] = body;
  }
  if (registration.dualOpenAI && Object.keys(mapped).length > 0) {
    result.openai = mapped;
  }
  for (const extra of registration.also ?? []) {
    const extraBody = buildImageRequest(paramValues, extra.profile);
    if (Object.keys(extraBody).length > 0) {
      result[extra.key] = extraBody;
    }
  }
  return result;
}

function buildImageRequest(
  paramValues: Record<string, unknown>,
  profile: WireProfile,
): Record<string, JSONValue> {
  const body: Record<string, JSONValue> = {};

  for (const key of profile.forward ?? []) {
    const value = paramValues[key];
    if (!shouldSkip(value)) {
      body[wireName(key)] = value as JSONValue;
    }
  }

  for (const [key, rule] of Object.entries(profile.fields ?? {})) {
    if (!rule) {
      continue;
    }
    const value = paramValues[key];
    if (shouldSkip(value)) {
      continue;
    }
    if (rule.contribute) {
      mergeContribution(body, rule.contribute(value, paramValues));
    } else if (rule.to) {
      body[rule.to] = rule.map ? rule.map(value, paramValues) : (value as JSONValue);
    }
  }
  return body;
}

function shouldSkip(value: unknown): boolean {
  return value === undefined || value === null || value === '' || value === 'auto';
}

function passthroughExtras(
  vendorBag: Record<string, unknown>,
  profile: WireProfile,
): Record<string, unknown> {
  const mappedKeys = new Set([...(profile.forward ?? []), ...Object.keys(profile.fields ?? {})]);
  return Object.fromEntries(
    Object.entries(vendorBag).filter(([key]) => !mappedKeys.has(key as CanonicalParamKey)),
  );
}

function jsonBag(values: Record<string, unknown>): Record<string, JSONValue> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) =>
        value !== undefined && typeof value !== 'function' && typeof value !== 'symbol',
    ),
  ) as Record<string, JSONValue>;
}

function mergeContribution(
  body: Record<string, JSONValue>,
  contribution: Record<string, JSONValue>,
) {
  for (const [key, value] of Object.entries(contribution)) {
    if (isPlainObject(value)) {
      const target = isPlainObject(body[key]) ? body[key] : {};
      mergeContribution(target, value);
      if (Object.keys(target).length > 0) {
        body[key] = target;
      }
    } else if (!shouldSkip(value)) {
      body[key] = value;
    }
  }
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
