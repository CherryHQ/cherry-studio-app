import {
  buildParamsSchema,
  type CanonicalParamKey,
  type ImageGenerationMode,
  type ImageGenerationSupport,
  type ImageModeDef,
  type ParamValues,
  type SupportSpec,
} from '@cherrystudio/provider-registry';

export type ImageParamDraft = Record<string, unknown>;

export type ImageParamField = {
  key: CanonicalParamKey;
  spec: SupportSpec;
};

export type ResolvedImageGenerationMode = {
  definition: ImageModeDef;
  mode: ImageGenerationMode;
};

export function resolveImageGenerationMode(
  support: ImageGenerationSupport | undefined,
  hasInputImages: boolean,
): ResolvedImageGenerationMode | undefined {
  const modes = support?.modes;
  if (!modes) {
    return undefined;
  }

  const preferredMode: ImageGenerationMode = hasInputImages ? 'edit' : 'generate';
  const preferredDefinition = modes[preferredMode];
  if (preferredDefinition) {
    return { definition: preferredDefinition, mode: preferredMode };
  }

  const fallbackMode = Object.keys(modes)[0] as ImageGenerationMode | undefined;
  const fallbackDefinition = fallbackMode ? modes[fallbackMode] : undefined;
  return fallbackMode && fallbackDefinition
    ? { definition: fallbackDefinition, mode: fallbackMode }
    : undefined;
}

/**
 * Shape of the image a request will produce, read back from the params that
 * asked for it. A placeholder tile has no image to measure, so this is the only
 * way to size it before the generation lands — and every key here is optional
 * in the registry, hence the square fallback.
 */
export function imageParamsAspectRatio(values: ParamValues | undefined): number {
  const ratio = parseRatio(values?.aspectRatio);
  if (ratio !== undefined) {
    return ratio;
  }
  const size = parseSize(values?.size) ?? parseSize(values?.imageResolution);
  return size ?? 1;
}

/** Human-readable resolution for the generation loader's badge. */
export function imageParamsResolutionLabel(values: ParamValues | undefined): string | undefined {
  for (const value of [values?.size, values?.imageResolution, values?.resolution]) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (
      normalized.length > 0 &&
      normalized.toLowerCase() !== 'auto' &&
      normalized.toLowerCase() !== 'custom'
    ) {
      return normalized.replace(/^(\d+)\s*[x\u00d7]\s*(\d+)$/i, '$1 \u00d7 $2');
    }
  }
  return undefined;
}

function parseRatio(value: unknown): number | undefined {
  return typeof value === 'string' ? toRatio(value.split(':')) : undefined;
}

function parseSize(value: unknown): number | undefined {
  return typeof value === 'string' ? toRatio(value.toLowerCase().split('x')) : undefined;
}

function toRatio(parts: string[]): number | undefined {
  if (parts.length !== 2) {
    return undefined;
  }
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  return width > 0 && height > 0 ? width / height : undefined;
}

export function getImageParamFields(
  resolvedMode: ResolvedImageGenerationMode | undefined,
): ImageParamField[] {
  if (!resolvedMode) {
    return [];
  }

  return Object.entries(resolvedMode.definition.supports).flatMap(([key, spec]) =>
    spec ? [{ key: key as CanonicalParamKey, spec }] : [],
  );
}

export function reconcileImageParamDraft(
  current: ImageParamDraft,
  resolvedMode: ResolvedImageGenerationMode | undefined,
): ImageParamDraft {
  const fields = getImageParamFields(resolvedMode);
  const next: ImageParamDraft = {};
  const customSizePairs = new Map<
    string,
    { key: CanonicalParamKey; spec: SupportSpec & { type: 'size' } }
  >();

  for (const field of fields) {
    if (field.spec.type === 'size') {
      customSizePairs.set(field.spec.pairedEnumKey ?? 'size', {
        key: field.key,
        spec: field.spec,
      });
    }
  }

  for (const field of fields) {
    if (field.spec.type === 'size') {
      copyCustomSizeDraft(next, current, field.key, field.spec);
      continue;
    }

    const currentValue = current[field.key];
    const validValue = isSupportedValue(currentValue, field.spec, customSizePairs.has(field.key));
    if (validValue) {
      next[field.key] = currentValue;
      continue;
    }

    const defaultValue = defaultValueFor(field.spec);
    if (defaultValue !== undefined) {
      next[field.key] = defaultValue;
    }
  }

  // A custom-size spec can appear after its paired enum in Registry order.
  for (const [pairedKey, customSize] of customSizePairs) {
    const currentValue = next[pairedKey];
    if (currentValue === 'custom') {
      const width = next[`${customSize.key}_width`];
      const height = next[`${customSize.key}_height`];
      if (!isValidSide(width, customSize.spec) || !isValidSide(height, customSize.spec)) {
        delete next[`${customSize.key}_width`];
        delete next[`${customSize.key}_height`];
        const pairedField = fields.find((field) => field.key === pairedKey);
        const pairedDefault = pairedField ? defaultValueFor(pairedField.spec) : undefined;
        if (pairedDefault === undefined) {
          delete next[pairedKey];
        } else {
          next[pairedKey] = pairedDefault;
        }
      }
    }
  }

  return next;
}

export function prepareImageParamValues(
  draft: ImageParamDraft,
  support: ImageGenerationSupport | undefined,
  resolvedMode: ResolvedImageGenerationMode | undefined,
): ParamValues {
  if (!resolvedMode) {
    return {};
  }

  const parsed = buildParamsSchema(support, resolvedMode.mode).parse(draft);
  const values: Record<string, unknown> = {};
  const fields = getImageParamFields(resolvedMode);
  const supportedKeys = new Set(fields.map((field) => field.key));

  for (const key of supportedKeys) {
    const value = parsed[key];
    if (value !== undefined && value !== null && value !== '') {
      values[key] = value;
    }
  }

  for (const field of fields) {
    if (field.spec.type !== 'size') {
      continue;
    }

    const pairedKey = field.spec.pairedEnumKey ?? 'size';
    if (values[pairedKey] !== 'custom') {
      delete values[field.key];
      continue;
    }

    const width = parsed[`${field.key}_width`];
    const height = parsed[`${field.key}_height`];
    if (!isValidSide(width, field.spec) || !isValidSide(height, field.spec)) {
      throw new Error('Invalid custom image size');
    }
    values[pairedKey] = `${width}x${height}`;
    delete values[field.key];
  }

  return values as ParamValues;
}

export function isImageParamDraftValid(
  draft: ImageParamDraft,
  resolvedMode: ResolvedImageGenerationMode | undefined,
): boolean {
  for (const field of getImageParamFields(resolvedMode)) {
    if (field.spec.type !== 'size') {
      continue;
    }
    const pairedKey = field.spec.pairedEnumKey ?? 'size';
    if (draft[pairedKey] !== 'custom') {
      continue;
    }
    if (
      !isValidSide(draft[`${field.key}_width`], field.spec) ||
      !isValidSide(draft[`${field.key}_height`], field.spec)
    ) {
      return false;
    }
  }
  return true;
}

function copyCustomSizeDraft(
  next: ImageParamDraft,
  current: ImageParamDraft,
  key: CanonicalParamKey,
  spec: SupportSpec & { type: 'size' },
) {
  const widthKey = `${key}_width`;
  const heightKey = `${key}_height`;
  if (isValidSide(current[widthKey], spec)) {
    next[widthKey] = current[widthKey];
  }
  if (isValidSide(current[heightKey], spec)) {
    next[heightKey] = current[heightKey];
  }
}

function defaultValueFor(spec: SupportSpec): unknown {
  switch (spec.type) {
    case 'switch':
      return spec.default ?? false;
    case 'range':
      return spec.default ?? spec.min;
    case 'enum':
      return spec.default;
    case 'size':
    case 'text':
      return undefined;
  }
}

function isSupportedValue(value: unknown, spec: SupportSpec, supportsCustom: boolean): boolean {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  switch (spec.type) {
    case 'switch':
      return typeof value === 'boolean';
    case 'enum':
      return spec.options.includes(String(value)) || (supportsCustom && value === 'custom');
    case 'range': {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric >= spec.min && numeric <= spec.max;
    }
    case 'text':
      return typeof value === 'string' || typeof value === 'number';
    case 'size':
      return false;
  }
}

function isValidSide(value: unknown, spec: SupportSpec & { type: 'size' }): value is number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= spec.minSide && numeric <= spec.maxSide;
}
