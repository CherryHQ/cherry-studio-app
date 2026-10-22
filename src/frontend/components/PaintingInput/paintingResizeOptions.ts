import {
  getImageParamFields,
  type ImageParamDraft,
  type ResolvedImageGenerationMode,
} from '@/shared/utils/imageGenerationParams';

import { optionRatioLabel, pixelSizeLabel } from './imageGenerationLabels';

/**
 * Changing the ratio offers only declared dimensions and carries their exact
 * request value; pixel sizes read as their nominal ratio and also report their dimensions.
 */
export function paintingResizeOptions(mode: ResolvedImageGenerationMode | undefined) {
  const fields = getImageParamFields(mode);
  for (const key of ['aspectRatio', 'size', 'imageResolution'] as const) {
    const field = fields.find((item) => item.key === key && item.spec.type === 'enum');
    if (!field || field.spec.type !== 'enum') continue;
    const options = new Map<
      string,
      { ratio: string; paramValues: ImageParamDraft; pixels?: string }
    >();
    for (const value of field.spec.options) {
      const ratio = optionRatioLabel(key, value);
      if (!ratio) continue;
      const pixels = pixelSizeLabel(key, value);
      if (key !== 'aspectRatio' && !pixels) continue;
      if (!options.has(ratio) || value === field.spec.default) {
        options.set(ratio, {
          ratio,
          paramValues: { [field.key]: value },
          ...(pixels && { pixels }),
        });
      }
    }
    if (options.size > 0) return [...options.values()];
  }
  return [];
}
