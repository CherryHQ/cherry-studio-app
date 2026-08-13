import { SymbolView } from 'expo-symbols';
import type { ReactElement } from 'react';
import { Platform, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';
import { useResolveClassNames } from 'uniwind';

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

/**
 * Matches the file the generator subsets into `src/fonts/`, which app.json's expo-font plugin
 * bundles into `assets/fonts/` — where Android resolves a family by the file's base name. Bundling
 * it natively (rather than expo-symbols' own Android path, which `loadAsync`s per mount and renders
 * a blank box until it resolves) is what makes the first frame correct.
 */
const materialFontFamily = 'MaterialSymbols';

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

    if (Platform.OS === 'ios') {
      return (
        // SymbolView is an ExpoView wrapping a UIImageView, and `UIImage(systemName:)` carries
        // UIKit's own accessibility description — so an icon-only button announces
        // "waveform.path.ecg" to VoiceOver. Neither `accessible` nor `accessibilityElementsHidden`
        // on SymbolView suppresses that inner view, so hide the subtree from a plain wrapper.
        // Icons are decorative; the enclosing pressable owns the label.
        <View
          accessibilityElementsHidden
          style={[{ height: resolvedHeight, width: resolvedWidth }, style]}
        >
          <SymbolView
            name={config.sf}
            resizeMode="scaleAspectFit"
            size={Math.min(resolvedWidth, resolvedHeight)}
            style={{ height: resolvedHeight, width: resolvedWidth }}
            tintColor={resolvedColor}
          />
        </View>
      );
    }

    return (
      <Text
        accessible={false}
        allowFontScaling={false}
        importantForAccessibility="no"
        style={[
          {
            color: resolvedColor,
            fontFamily: materialFontFamily,
            fontSize: Math.min(resolvedWidth, resolvedHeight),
            height: resolvedHeight,
            // Glyphs sit on the em square, so line height = height centers them once Android's
            // extra font padding is off.
            includeFontPadding: false,
            lineHeight: resolvedHeight,
            textAlign: 'center',
            width: resolvedWidth,
          },
          style as StyleProp<TextStyle>,
        ]}
      >
        {config.glyph}
      </Text>
    );
  }

  AppIcon.displayName = config.displayName;

  return AppIcon;
}
