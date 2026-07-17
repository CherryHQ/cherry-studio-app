import {
  BlurMask,
  Canvas,
  Group,
  matchFont,
  type SkFont,
  Text as SkiaText,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useUniwind } from 'uniwind';

import { glyphIdentities, lineStartX, rippleDelayMs } from './utils/animatedTextLayout';

/**
 * Skia-rendered text that morphs between values at the character level.
 * Characters the old and new string share stay mounted and slide to their new
 * position; everything else cross-fades through a per-glyph Gaussian blur —
 * departing glyphs melt in place (shrink + blur + fade), arriving ones
 * condense while dropping in from just above. The stagger ripples outward
 * from the middle of the string. With reduced motion the swap is instant.
 *
 * Rendering goes through Skia because RN views can't blur individual glyphs;
 * the font is matched from the system (this app bundles no display font).
 */

const MOVE_MS = 220;
const ENTER_MS = 240;
const EXIT_MS = 190;
const RIPPLE_STEP_MS = 18;
const ENTER_DROP = 10; // px an arriving glyph falls from
const MELT_SCALE = 0.9; // scale a glyph melts down to / condenses up from
const MELT_BLUR = 5; // Gaussian blur radius at full melt
const EXIT_TTL_SLACK_MS = 80; // margin past the slowest exit before cleanup
const settle = Easing.out(Easing.cubic);

// PingFang covers CJK + Latin; plain Latin families would tofu Chinese labels.
const defaultFontFamily = Platform.select({ ios: 'PingFang SC', default: 'sans-serif' });

// JS-side Skia colors can't read CSS variables; mirror --cs-foreground.
const defaultColor = {
  light: 'rgba(0, 0, 0, 0.9)',
  dark: 'rgba(255, 255, 255, 0.9)',
} as const;

type GlyphLayout = {
  id: string;
  char: string;
  x: number;
  advance: number;
  delayMs: number;
};

export type AnimatedTextProps = {
  value: string;
  width?: number;
  height?: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | '400' | '500' | '600' | '700';
  /** System family to match; the default also covers CJK. */
  fontFamily?: string;
  /** Defaults to the theme foreground. */
  color?: string;
  align?: 'left' | 'center';
  /** Per-glyph ripple step; 0 animates every glyph together. */
  staggerStepMs?: number;
  containerStyle?: ViewStyle;
  testID?: string;
};

export function AnimatedText({
  value,
  width = 240,
  height = 48,
  fontSize = 24,
  fontWeight = 'normal',
  fontFamily = defaultFontFamily,
  color,
  align = 'center',
  staggerStepMs = RIPPLE_STEP_MS,
  containerStyle,
  testID,
}: AnimatedTextProps) {
  const { theme } = useUniwind();
  const reducedMotion = useReducedMotion();
  const glyphColor = color ?? defaultColor[theme === 'dark' ? 'dark' : 'light'];

  const font = useMemo(
    () => matchFont({ fontFamily, fontSize, fontWeight }),
    [fontFamily, fontSize, fontWeight],
  );
  // True vertical centring from font metrics (ascent is negative in Skia).
  const metrics = font.getMetrics();
  const baselineY = height / 2 - (metrics.ascent + metrics.descent) / 2;
  const glyphMidY = (metrics.ascent + metrics.descent) / 2;

  const glyphs = useMemo<GlyphLayout[]>(() => {
    const identities = glyphIdentities(value);
    const advances = font.getGlyphWidths(font.getGlyphIDs(value));
    let x = lineStartX(advances, width, align);

    return identities.map((identity, index) => {
      const advance = advances[index] ?? 0;
      const layout: GlyphLayout = {
        id: identity.id,
        char: identity.char,
        x,
        advance,
        delayMs: rippleDelayMs(index, identities.length, staggerStepMs),
      };
      x += advance;
      return layout;
    });
  }, [align, font, staggerStepMs, value, width]);

  // Glyphs from the previous value that the new one doesn't contain; they
  // stay mounted (same React key -> same shared values) until their melt
  // finishes, then one timer sweeps the whole batch.
  const [departed, setDeparted] = useState<GlyphLayout[]>([]);
  const previousGlyphs = useRef(glyphs);

  useEffect(() => {
    const previous = previousGlyphs.current;
    if (previous === glyphs) {
      return;
    }
    previousGlyphs.current = glyphs;
    if (reducedMotion) {
      return;
    }
    const activeIds = new Set(glyphs.map((glyph) => glyph.id));
    setDeparted((current) => {
      const kept = current.filter((glyph) => !activeIds.has(glyph.id));
      const keptIds = new Set(kept.map((glyph) => glyph.id));
      const leaving = previous.filter(
        (glyph) => !activeIds.has(glyph.id) && !keptIds.has(glyph.id),
      );
      return [...kept, ...leaving];
    });
  }, [glyphs, reducedMotion]);

  useEffect(() => {
    if (departed.length === 0) {
      return;
    }
    const slowest = Math.max(...departed.map((glyph) => glyph.delayMs));
    const timer = setTimeout(() => setDeparted([]), EXIT_MS + slowest + EXIT_TTL_SLACK_MS);
    return () => clearTimeout(timer);
  }, [departed]);

  // One flat keyed list: a glyph crossing between the active and departed
  // sets must keep its React instance (and with it, its mid-flight shared
  // values) — split arrays would remount it. Filter id collisions here too:
  // when a departing character returns, the state cleanup effect runs only
  // after this render, so `departed` can still hold an id `glyphs` now owns.
  const activeIds = new Set(glyphs.map((glyph) => glyph.id));
  const scene = [
    ...glyphs.map((glyph) => ({ glyph, departing: false })),
    ...departed
      .filter((glyph) => !activeIds.has(glyph.id))
      .map((glyph) => ({ glyph, departing: true })),
  ];

  return (
    <View style={containerStyle} testID={testID}>
      <Canvas style={{ width, height }}>
        {scene.map(({ glyph, departing }) => (
          <MorphGlyph
            baselineY={baselineY}
            color={glyphColor}
            departing={departing}
            font={font}
            glyph={glyph}
            glyphMidY={glyphMidY}
            key={glyph.id}
            reducedMotion={reducedMotion}
          />
        ))}
      </Canvas>
    </View>
  );
}

type MorphGlyphProps = {
  glyph: GlyphLayout;
  font: SkFont;
  color: string;
  baselineY: number;
  /** Vertical middle of a glyph relative to its baseline (negative). */
  glyphMidY: number;
  departing: boolean;
  reducedMotion: boolean;
};

function MorphGlyph({
  glyph,
  font,
  color,
  baselineY,
  glyphMidY,
  departing,
  reducedMotion,
}: MorphGlyphProps) {
  const slideX = useSharedValue(glyph.x);
  const dropY = useSharedValue(reducedMotion ? 0 : -ENTER_DROP);
  const size = useSharedValue(reducedMotion ? 1 : MELT_SCALE);
  const alpha = useSharedValue(reducedMotion ? 1 : 0);
  const haze = useSharedValue(reducedMotion ? 0 : MELT_BLUR);

  // Arrive (mount), slide (x prop moved), and un-melt (a departing glyph's
  // character reappears in the next value): withTiming toward the current
  // target is a no-op when already there, so one effect covers all three.
  useEffect(() => {
    if (departing) {
      return;
    }
    if (reducedMotion) {
      slideX.set(glyph.x);
      return;
    }
    slideX.set(withTiming(glyph.x, { duration: MOVE_MS, easing: settle }));
    const arrive = { duration: ENTER_MS, easing: settle };
    dropY.set(withDelay(glyph.delayMs, withTiming(0, arrive)));
    size.set(withDelay(glyph.delayMs, withTiming(1, arrive)));
    alpha.set(withDelay(glyph.delayMs, withTiming(1, arrive)));
    haze.set(withDelay(glyph.delayMs, withTiming(0, arrive)));
  }, [alpha, departing, dropY, glyph.delayMs, glyph.x, haze, reducedMotion, size, slideX]);

  // Melt in place once this glyph moves to the departed list.
  useEffect(() => {
    if (!departing) {
      return;
    }
    const melt = { duration: EXIT_MS, easing: settle };
    size.set(withDelay(glyph.delayMs, withTiming(MELT_SCALE, melt)));
    alpha.set(withDelay(glyph.delayMs, withTiming(0, melt)));
    haze.set(withDelay(glyph.delayMs, withTiming(MELT_BLUR, melt)));
  }, [alpha, departing, glyph.delayMs, haze, size]);

  const transform = useDerivedValue(() => [
    { translateX: slideX.value },
    { translateY: baselineY + dropY.value },
    { scale: size.value },
  ]);

  return (
    <Group opacity={alpha} origin={{ x: glyph.advance / 2, y: glyphMidY }} transform={transform}>
      <SkiaText color={color} font={font} text={glyph.char} x={0} y={0} />
      <BlurMask blur={haze} style="normal" />
    </Group>
  );
}
