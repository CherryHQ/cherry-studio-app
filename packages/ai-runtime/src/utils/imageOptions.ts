import type { CanonicalParamKey, ParamValues } from '@cherrystudio/provider-registry';

type NativeBinding = {
  map?: (value: unknown) => unknown;
  option: string;
};

export type SplitImageParams = {
  structured: ParamValues & { n?: number };
  vendorBag: Record<string, unknown>;
};

export function normalizeAspectRatio(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const stripped = value.replace(/^ASPECT_/i, '').replace('_', ':');
  return /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(stripped) ? stripped : undefined;
}

const AI_SDK_NATIVE_BINDINGS = {
  aspectRatio: {
    map: (value: unknown) => normalizeAspectRatio(typeof value === 'string' ? value : undefined),
    option: 'aspectRatio',
  },
  numImages: { option: 'n' },
  seed: { option: 'seed' },
  size: { option: 'size' },
} as const satisfies Partial<Record<CanonicalParamKey, NativeBinding>>;

export function splitImageParamValues(paramValues: Record<string, unknown>): SplitImageParams {
  const structured: Record<string, unknown> = {};
  const vendorBag: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(paramValues)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    const binding = (AI_SDK_NATIVE_BINDINGS as Record<string, NativeBinding | undefined>)[key];
    if (!binding) {
      vendorBag[key] = value;
      continue;
    }
    const mapped = binding.map ? binding.map(value) : value;
    if (mapped !== undefined && mapped !== null && mapped !== '') {
      structured[binding.option] = mapped;
    }
  }

  return {
    structured: structured as ParamValues & { n?: number },
    vendorBag,
  };
}

/** Desktop-compatible name retained for provider wire ports. */
export const splitParamValues = splitImageParamValues;
