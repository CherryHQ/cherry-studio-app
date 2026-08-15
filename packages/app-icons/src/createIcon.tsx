import type { ReactElement } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useResolveClassNames } from 'uniwind';

import { IconGlyph } from './icon-glyph/icon-glyph';

export type AppIconProps = {
  /** Tailwind classes; `size-*` drives width/height and `text-*` drives the glyph color. */
  className?: string;
  /** Glyph color (SF Symbol tint on iOS, Material font color on Android). */
  color?: string | null;
  /** Square size in points. Overridden by explicit `width`/`height`. */
  size?: number;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

const defaultIconSize = 24;

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
 * Wraps one registry entry into an icon component with the same call-site contract as the lucide
 * PNG icons it replaces — explicit props (`color`/`size`/`width`/`height`) win over className
 * (`size-6 text-foreground`), which wins over the 24pt default.
 *
 * iOS renders the real SF Symbol through expo-symbols' native view. Android renders the Material
 * Symbols glyph as a single `Text` — one core node, deliberately cheaper to mount in long lists
 * than an react-native-svg tree (the reason the PNG variant existed).
 */
export function createIcon(config: { displayName: string; sf: SFSymbol; glyph: string }) {
  function AppIcon({ className, color, height, size, style, width }: AppIconProps): ReactElement {
    const styles = useResolveClassNames(className ?? '');
    const resolvedWidth = width ?? size ?? toDimension(styles.width) ?? defaultIconSize;
    const resolvedHeight = height ?? size ?? toDimension(styles.height) ?? defaultIconSize;
    const resolvedColor = color ?? toColor(styles.color);

    return (
      <IconGlyph
        color={resolvedColor}
        config={config}
        height={resolvedHeight}
        style={style}
        width={resolvedWidth}
      />
    );
  }

  AppIcon.displayName = config.displayName;

  return AppIcon;
}
