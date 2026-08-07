import { Image } from 'expo-image';
import type { ReactElement } from 'react';
import type { ImageStyle, StyleProp } from 'react-native';
import { useResolveClassNames } from 'uniwind';

export type PngIconProps = {
  /** Tailwind classes; `size-*` drives width/height and `text-*` drives the tint color. */
  className?: string;
  /** Tint color applied to the monochrome icon (maps to expo-image `tintColor`). */
  color?: string | null;
  /** Square size in points. Overridden by explicit `width`/`height`. */
  size?: number;
  width?: number;
  height?: number;
  /** Accepted for lucide API compatibility; ignored (the stroke is baked into the PNG). */
  strokeWidth?: number;
  style?: StyleProp<ImageStyle>;
};

const defaultPngIconSize = 24;

function toDimension(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
}

function toColor(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Wraps a generated monochrome PNG asset into a lucide-compatible icon component.
 *
 * Renders a single `expo-image` `<Image>` (one native node) tinted via `color`/`text-*`, instead
 * of react-native-svg's `<Svg>` + `<Path>` tree. In long virtualized lists the RNSVG mount cost
 * dominates, so the PNG variant is dramatically cheaper to mount while keeping the same call sites
 * as the lucide icon it replaces — both explicit props (`color`/`size`/`width`/`height`) and
 * className (`size-6 text-foreground`).
 *
 * Precedence matches the SVG `iconWithClassName` wrapper: explicit props win over className, which
 * wins over the default size.
 */
export function createPngIcon(source: number, displayName: string) {
  function PngIcon({ className, color, height, size, style, width }: PngIconProps): ReactElement {
    const styles = useResolveClassNames(className ?? '');
    const resolvedWidth = width ?? size ?? toDimension(styles.width) ?? defaultPngIconSize;
    const resolvedHeight = height ?? size ?? toDimension(styles.height) ?? defaultPngIconSize;
    const resolvedColor = color ?? toColor(styles.color);

    return (
      <Image
        contentFit="contain"
        source={source}
        style={[{ height: resolvedHeight, width: resolvedWidth }, style]}
        tintColor={resolvedColor}
      />
    );
  }

  PngIcon.displayName = displayName;

  return PngIcon;
}
