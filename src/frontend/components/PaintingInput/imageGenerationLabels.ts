import type { CanonicalParamKey } from '@cherrystudio/provider-registry';
import type { TFunction } from 'i18next';

import {
  parseImageRatio,
  type ImageParamDraft,
  type ImageParamField,
} from '@/shared/utils/imageGenerationParams';

const PARAM_LABEL_KEYS = {
  addWatermark: 'painting.settings.param.addWatermark',
  aspectRatio: 'painting.settings.param.aspectRatio',
  background: 'painting.settings.param.background',
  bottomScale: 'painting.settings.param.bottomScale',
  cfg: 'painting.settings.param.cfg',
  customSize: 'painting.settings.param.customSize',
  detail: 'painting.settings.param.detail',
  enableInterleave: 'painting.settings.param.enableInterleave',
  function: 'painting.settings.param.function',
  guidanceScale: 'painting.settings.param.guidanceScale',
  imageResolution: 'painting.settings.param.imageResolution',
  imageWeight: 'painting.settings.param.imageWeight',
  isSketch: 'painting.settings.param.isSketch',
  leftScale: 'painting.settings.param.leftScale',
  magicPromptOption: 'painting.settings.param.magicPromptOption',
  maxImages: 'painting.settings.param.maxImages',
  moderation: 'painting.settings.param.moderation',
  negativePrompt: 'painting.settings.param.negativePrompt',
  numImages: 'painting.settings.param.numImages',
  numInferenceSteps: 'painting.settings.param.numInferenceSteps',
  outputCompression: 'painting.settings.param.outputCompression',
  outputFormat: 'painting.settings.param.outputFormat',
  personGeneration: 'painting.settings.param.personGeneration',
  promptEnhancement: 'painting.settings.param.promptEnhancement',
  promptExtend: 'painting.settings.param.promptExtend',
  quality: 'painting.settings.param.quality',
  refMode: 'painting.settings.param.refMode',
  refStrength: 'painting.settings.param.refStrength',
  renderingSpeed: 'painting.settings.param.renderingSpeed',
  resemblance: 'painting.settings.param.resemblance',
  resolution: 'painting.settings.param.resolution',
  rightScale: 'painting.settings.param.rightScale',
  safetyTolerance: 'painting.settings.param.safetyTolerance',
  seed: 'painting.settings.param.seed',
  sequentialImageGeneration: 'painting.settings.param.sequentialImageGeneration',
  size: 'painting.settings.param.size',
  sourceLang: 'painting.settings.param.sourceLang',
  strength: 'painting.settings.param.strength',
  style: 'painting.settings.param.style',
  styleType: 'painting.settings.param.styleType',
  targetLang: 'painting.settings.param.targetLang',
  thinkingMode: 'painting.settings.param.thinkingMode',
  topScale: 'painting.settings.param.topScale',
  upscaleFactor: 'painting.settings.param.upscaleFactor',
} as const satisfies Record<CanonicalParamKey, string>;

const OPTION_LABEL_KEYS: Partial<Record<CanonicalParamKey, Record<string, string>>> = {
  aspectRatio: { auto: 'painting.settings.option.auto' },
  background: {
    auto: 'painting.settings.option.auto',
    opaque: 'painting.settings.option.opaque',
    transparent: 'painting.settings.option.transparent',
  },
  imageResolution: { auto: 'painting.settings.option.auto' },
  moderation: {
    auto: 'painting.settings.option.auto',
    low: 'painting.settings.option.low',
  },
  personGeneration: {
    ALLOW_ADULT: 'painting.settings.option.allowAdult',
    ALLOW_ALL: 'painting.settings.option.allowAll',
    DONT_ALLOW: 'painting.settings.option.allowNone',
  },
  quality: {
    auto: 'painting.settings.option.auto',
    hd: 'painting.settings.option.hd',
    high: 'painting.settings.option.high',
    low: 'painting.settings.option.low',
    medium: 'painting.settings.option.medium',
    standard: 'painting.settings.option.standard',
  },
  refMode: {
    refonly: 'painting.settings.option.referenceOnly',
    repaint: 'painting.settings.option.repaint',
  },
  renderingSpeed: {
    DEFAULT: 'painting.settings.option.default',
    QUALITY: 'painting.settings.option.quality',
    TURBO: 'painting.settings.option.turbo',
  },
  sequentialImageGeneration: {
    auto: 'painting.settings.option.auto',
    disabled: 'painting.settings.option.disabled',
  },
  size: { auto: 'painting.settings.option.auto', custom: 'painting.settings.option.custom' },
  style: {
    '<3d cartoon>': 'painting.settings.option.cartoon3d',
    '<anime>': 'painting.settings.option.anime',
    '<auto>': 'painting.settings.option.auto',
    '<chinese painting>': 'painting.settings.option.chinesePainting',
    '<flat illustration>': 'painting.settings.option.flatIllustration',
    '<oil painting>': 'painting.settings.option.oilPainting',
    '<photography>': 'painting.settings.option.photography',
    '<portrait>': 'painting.settings.option.portrait',
    '<sketch>': 'painting.settings.option.sketch',
    '<watercolor>': 'painting.settings.option.watercolor',
    natural: 'painting.settings.option.natural',
    vivid: 'painting.settings.option.vivid',
  },
  styleType: {
    ANIME: 'painting.settings.option.anime',
    AUTO: 'painting.settings.option.auto',
    DESIGN: 'painting.settings.option.design',
    GENERAL: 'painting.settings.option.general',
    REALISTIC: 'painting.settings.option.realistic',
    RENDER_3D: 'painting.settings.option.render3d',
  },
};

const SUMMARY_PRIORITY: CanonicalParamKey[] = [
  'size',
  'aspectRatio',
  'imageResolution',
  'resolution',
  'numImages',
  'quality',
];

export function imageParamLabel(t: TFunction, key: CanonicalParamKey): string {
  return t(PARAM_LABEL_KEYS[key]);
}

/** Pixel sizes such as `1536x1024` read as `3:2 · 1536×1024`; ratios read as `3:2`. */
export function imageParamOptionLabel(t: TFunction, key: CanonicalParamKey, value: string): string {
  const pixels = pixelSizeLabel(key, value);
  const ratio = optionRatioLabel(key, value);
  if (pixels) return `${ratio} · ${pixels}`;
  if (ratio && key === 'aspectRatio') return ratio;
  const translationKey = OPTION_LABEL_KEYS[key]?.[value];
  return translationKey ? t(translationKey) : value;
}

const PIXEL_SIZE_KEYS = new Set<CanonicalParamKey>(['size', 'imageResolution']);

/** `1536x1024` → `1536×1024`; undefined for anything that is not an exact pixel size. */
export function pixelSizeLabel(key: CanonicalParamKey, value: string): string | undefined {
  const match = PIXEL_SIZE_KEYS.has(key) && /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(value);
  return match ? `${match[1]}×${match[2]}` : undefined;
}

/** The ratio an option reads as: declared ratios verbatim, pixel sizes by their nominal ratio. */
export function optionRatioLabel(key: CanonicalParamKey, value: unknown): string | undefined {
  const ratio = parseImageRatio(value);
  if (!ratio) return undefined;
  return key === 'aspectRatio'
    ? `${ratio.width}:${ratio.height}`
    : nominalRatio(ratio.width, ratio.height);
}

const COMMON_RATIOS = [
  [1, 1],
  [5, 4],
  [4, 3],
  [3, 2],
  [16, 9],
  [2, 1],
  [21, 9],
  [3, 1],
].flatMap(([w, h]) =>
  w === h
    ? [[w, h]]
    : [
        [w, h],
        [h, w],
      ],
);

/**
 * Vendors round pixel sizes to model-friendly multiples (`1664x928` is their 16:9), so exact
 * reduction yields `52:29` or nothing. A common ratio within 2% wins; then a short exact ratio;
 * then the nearest common ratio.
 */
function nominalRatio(width: number, height: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return `${width}:${height}`;
  const distance = ([w, h]: number[]) => Math.abs(Math.log((width * h) / (height * w)));
  const nearest = COMMON_RATIOS.reduce((best, ratio) =>
    distance(ratio) < distance(best) ? ratio : best,
  );
  const divisor = greatestCommonDivisor(width, height);
  const w = width / divisor;
  const h = height / divisor;
  return distance(nearest) > 0.02 && w <= 32 && h <= 32
    ? `${w}:${h}`
    : `${nearest[0]}:${nearest[1]}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

export function imageParamSummary(
  t: TFunction,
  fields: readonly ImageParamField[],
  values: ImageParamDraft,
): string | undefined {
  const fieldMap = new Map(fields.map((field) => [field.key, field]));
  const fallbackKeys = fields
    .filter((field) => field.spec.type === 'enum' || field.spec.type === 'range')
    .map((field) => field.key);
  const keys = [...new Set([...SUMMARY_PRIORITY, ...fallbackKeys])];
  const parts: string[] = [];

  for (const key of keys) {
    const field = fieldMap.get(key);
    const value = values[key];
    if (!field || value === undefined || value === null || value === '') {
      continue;
    }
    if (value === 'custom') {
      const width = values.customSize_width;
      const height = values.customSize_height;
      if (width && height) {
        parts.push(`${String(width)}×${String(height)}`);
      }
    } else if (key === 'numImages') {
      parts.push(`×${String(value)}`);
    } else if (field.spec.type === 'enum') {
      parts.push(imageParamOptionLabel(t, key, String(value)));
    } else {
      parts.push(String(value));
    }
    if (parts.length === 2) {
      break;
    }
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
}
