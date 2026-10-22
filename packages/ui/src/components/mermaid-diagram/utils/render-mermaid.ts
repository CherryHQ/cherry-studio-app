import { requireOptionalNativeModule } from 'expo';

export type MermaidRenderResult = {
  svg: string;
  width: number;
  height: number;
  accessibilityLabel: string;
};

type MermaidNativeModule = {
  render(source: string, palette: Record<string, string>): Promise<MermaidRenderResult | null>;
};

// Recycled message rows can reuse completed layouts. Bound source and SVG retention together.
const MAX_CACHED_DIAGRAMS = 24;
const renders = new Map<string, Promise<MermaidRenderResult | null>>();

export function renderMermaid(
  source: string,
  paletteJson: string,
): Promise<MermaidRenderResult | null> {
  if (source.length > 32_768) return Promise.resolve(null);
  const native = requireOptionalNativeModule<MermaidNativeModule>('MermaidRenderer');
  if (!native) return Promise.resolve(null);

  const key = JSON.stringify([source, paletteJson]);
  const cached = renders.get(key);
  if (cached) {
    renders.delete(key);
    renders.set(key, cached);
    return cached;
  }

  const result = Promise.resolve()
    .then(() => native.render(source, JSON.parse(paletteJson)))
    .then((diagram) =>
      diagram &&
      Number.isFinite(diagram.width) &&
      Number.isFinite(diagram.height) &&
      diagram.width > 0 &&
      diagram.height > 0 &&
      typeof diagram.svg === 'string' &&
      diagram.svg.length <= 524_288
        ? diagram
        : null,
    )
    .catch(() => null);
  renders.set(key, result);
  if (renders.size > MAX_CACHED_DIAGRAMS) renders.delete(renders.keys().next().value!);
  return result;
}
