import {
  getImageParamFields,
  parseImageRatio,
  type ImageParamDraft,
  type ResolvedImageGenerationMode,
} from '@/shared/utils/imageGenerationParams';

/** Resize picks only declared dimensions and carries their exact request value into the editor. */
export function paintingResizeOptions(mode: ResolvedImageGenerationMode | undefined) {
  const fields = getImageParamFields(mode);
  for (const key of ['aspectRatio', 'size', 'imageResolution']) {
    const field = fields.find((item) => item.key === key && item.spec.type === 'enum');
    if (!field || field.spec.type !== 'enum') continue;
    const options = new Map<string, { ratio: string; paramValues: ImageParamDraft }>();
    for (const value of field.spec.options) {
      const dimensions = parseImageRatio(value);
      if (!dimensions) continue;
      let ratio = `${dimensions.width}:${dimensions.height}`;
      if (key !== 'aspectRatio') {
        if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height)) continue;
        let { width, height } = dimensions;
        while (height) [width, height] = [height, width % height];
        ratio = `${dimensions.width / width}:${dimensions.height / width}`;
      }
      if (!options.has(ratio) || value === field.spec.default) {
        options.set(ratio, { ratio, paramValues: { [field.key]: value } });
      }
    }
    if (options.size > 0) return [...options.values()];
  }
  return [];
}
