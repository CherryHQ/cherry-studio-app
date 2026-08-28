import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable as isSystemLiquidGlassAvailable,
} from 'expo-glass-effect';

export const defaultLanguage = 'en-US';
export const isLiquidGlassAvailable = isSystemLiquidGlassAvailable() && isGlassEffectAPIAvailable();

// Gap kept between the keyboard and the focused input inside scrollable forms.
export const keyboardBottomOffset = 16;

// Padding below a screen-bottom action button when the safe-area inset is
// smaller than this (home-button devices report 0), so the button never sits
// flush against the screen edge.
export const screenBottomActionInset = 16;

// Native transition played over a theme switch (react-native-nitro-theme-transition).
// The theme itself is instant — Uniwind commits it to the shadow tree in C++ — so
// what animates is a GPU snapshot of the old screen fading out over the new one.
//
// `fade` is the only kind that needs no "did the resolved theme actually change"
// guard: an opaque snapshot going alpha 1 -> 0 over an identical screen composites
// to that screen at every step, so switching to `system` on a device already in
// that scheme is invisible rather than a flicker. Every reveal-shaped kind would
// draw a visible edge there.
//
// Duration is the only knob: the curve is compiled into the library, which is
// deliberate on its part — `(0.4, 0, 0.2, 1)` is shared by both platforms so they look
// identical, and the author's comment on it explains that he already tried a snappier,
// front-loaded curve and backed it out. Changing it would mean patching two native
// files with nothing tying them to `easing.settle` in packages/ui/src/motion.ts.
//
// 800ms, a shade above the library's 650ms default, picked by eye. Tap-to-settled
// measured on a debug build: 389ms with the transition bypassed entirely, 379ms with it
// but `durationMs: 0`, 735ms at 650ms, 945ms at 1000ms. The snapshot itself is therefore
// free — what it covers is the ~390ms `Uniwind.setTheme` already costs (recomputing every
// CSS variable and committing the shadow tree), which without it is just the screen
// sitting still. Past roughly the default, the duration stops hiding that cost and starts
// adding to it, so this is the slow end of the usable range rather than a free choice.
//
// The floor for `fade` is 200ms, but 350ms bunches most of the luminance travel into the
// middle ~150ms and reads as a flicker rather than as a crossfade.
//
// `settleFrames` is left at the library default of 2. That is calibrated for theme
// systems that apply synchronously, which is exactly what `Uniwind.setTheme` is.
export const themeTransition = { kind: 'fade', durationMs: 800 } as const;

// Tuning knobs for the GitHub-style AI usage calendars.
// Sizes and spring feel replicate the reference contribution-graph animation
// 1:1 — adjust here, not in the AI usage components. The heat scale is not
// here: it was GitHub's own two ladders of five hex, one per theme, and it now
// comes from `--usage-level-*`, which `AiUsageCalendar` names.
export const aiUsageCalendar = {
  cellSize: 14,
  cellGap: 3,
  cellRadius: 2,
  summaryCellGap: 2,
  summaryFallbackCellSize: 10,
  dimmedOpacity: 0.35,
  sweepStepMs: 45, // per-diagonal delay of the bottom-left → top-right entrance wave
  enterSpring: { mass: 1.1, damping: 13, stiffness: 150, overshootClamping: false },
} as const;

// Painting viewer (fullscreen image viewer) tuning knobs.
export const paintingViewer = {
  // Resize menu options; each seeds the composer with a "change aspect ratio"
  // prompt. Ratios are limited to those with a matching `rectangle.ratio.*.to.*`
  // SF Symbol so the iOS menu can show a native aspect-ratio glyph per item.
  aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
} as const;

export const appSidebar = {
  fallbackCornerRadius: 55, // surface radius when the device is missing from expo-screen-corner-radius' table
  dockHeight: 48, // floating bottom dock's button height, shared by both buttons
  dockMinInset: 16, // floor for the dock's concentric inset (see SidebarDock)
  headerRowHeight: 40, // brand row's height below the status bar; the body scrolls under it
  headerGapY: 8, // header's breathing room above and below the brand row
  scrollShadowSize: 112, // ScrollShadow's top dissolve depth below the header
  headerBlurSize: 124, // progressive-blur depth behind the fixed header controls
  recentSessionLimit: 20, // most-recent sessions shown before the "view all" row
} as const;
