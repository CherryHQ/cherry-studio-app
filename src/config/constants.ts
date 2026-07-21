import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable as isSystemLiquidGlassAvailable,
} from 'expo-glass-effect';

export const defaultLanguage = 'en-US';
export const isAndroid = process.env.EXPO_OS === 'android';
export const isIOS = process.env.EXPO_OS === 'ios';
export const isLiquidGlassAvailable = isSystemLiquidGlassAvailable() && isGlassEffectAPIAvailable();

// Shared scrim (backdrop) color for every `ModalBottomSheet` so all sheets dim
// the background behind them consistently. Single source of truth — tune here.
export const sheetScrimColor = 'rgba(0, 0, 0, 0.4)';

// Brand accent (ui.theme_user.color_primary default). SlotText tints freshly
// landed glyphs with it before they fade to the regular text color.
export const slotTextHighlightColor = '#00b96b';

// Gap kept between the keyboard and the focused input inside scrollable forms.
export const keyboardBottomOffset = 16;

// Delay before imperatively focusing the native header search bar on iOS.
// UISearchController attaches to the navigation bar asynchronously, and a
// focus() call landing before that is silently ignored by UIKit.
export const searchBarAutoFocusDelayMs = 100;

// CherryIN OAuth configuration
export const CHERRYIN_CONFIG = {
  CLIENT_ID: '2a348c87-bae1-4756-a62f-b2e97200fd6d',
  ALLOWED_HOSTS: ['https://open.cherryin.ai', 'https://open.cherryin.dev'],
  REDIRECT_URI: 'cherrystudio://oauth/callback',
  SCOPES: 'openid profile email offline_access balance:read usage:read tokens:read tokens:write',
};

// Tuning knobs for the GitHub-style activity calendar card on the Home tab.
// Sizes, colors and spring feel replicate the reference contribution-graph
// animation 1:1 — adjust here, not in the activity components.
export const homeActivityCalendar = {
  cellSize: 14,
  cellGap: 3,
  cellRadius: 2,
  cardShadow: '0px 0px 20px 0px rgba(0, 0, 0, 0.05)',
  // no activity → highest; GitHub's green scales for both themes. Level 0 in
  // dark sits slightly above the dark surface so empty cells stay visible.
  levelColors: {
    light: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    dark: ['#2c2c2c', '#0e4429', '#006d32', '#26a641', '#39d353'],
  },
  sweepStepMs: 45, // per-diagonal delay of the bottom-left → top-right entrance wave
  resetMaxDelayMs: 500, // each square rewinds after a random slice of this window
  pressedScale: 0.96, // card press-down feedback
  previewWidthRatio: 0.9, // preview data length: days = floor(windowWidth * ratio / dayWidth)
  previewDayWidth: 3,
  enterSpring: { mass: 1.1, damping: 13, stiffness: 150, overshootClamping: false },
  exitSpring: { mass: 0.9, damping: 10, stiffness: 60 },
} as const;

// Tuning knobs for the painting loading grid skeleton — a 1:1 port of the
// desktop paintings skeleton (renderer/pages/paintings PaintingSkeletonGrid):
// a measured cols×rows grid of rounded cells whose brightness peak sweeps
// diagonally from the bottom-left to the top-right. Adjust here, not in the
// paintingSkeleton module.
export const paintingSkeleton = {
  gap: 5, // gap between cells and outer padding of the grid (dp)
  basePitch: 38, // starting cell+gap pitch the measurement divides the box by
  pitchStep: 2, // pitch growth per step while the grid exceeds maxCells
  maxCells: 100, // cap on cols*rows; larger boxes get a coarser grid instead
  cellRadius: 2.5,
  periodSeconds: 1.3, // one full diagonal sweep of the brightness wave (faster than desktop's 1.9)
  alphaMin: 0.06, // resting (unlit) cell opacity
  peakMin: 0.35, // dimmest per-cell peak opacity
  peakMax: 0.85, // brightest per-cell peak opacity
  afterglow: 0.25, // fraction of the peak still glowing on the falling edge
  phaseJitter: 0.1, // per-cell phase scatter, as a fraction of periodSeconds
  keyframeTimes: [0.39, 0.5, 0.68], // rise start / peak / afterglow points of the loop
  reducedMotionAlpha: 0.66, // static snapshot opacity when Reduce Motion is on
  // Cell color is foreground × foregroundAlpha × the animated opacity; rgb is
  // normalized for the shader and matches --cs-foreground (black light / white
  // dark), whose 0.9 alpha lives in foregroundAlpha.
  foregroundAlpha: 0.9,
  foreground: { light: [0, 0, 0], dark: [1, 1, 1] },
  // Act 2-4 image reveal (desktop parity): once a result image is ready the
  // grid tints (Act 2), fades in real per-cell slices chasing the tint wave
  // (Act 3), then a full image heals the gutters (Act 4). All in seconds,
  // relative to reveal start; per-cell start = (diag / maxDiag) * tintSweep.
  reveal: {
    tintSweep: 1.35, // one-shot diagonal color-reveal sweep across the grid
    tintDur: 0.68, // per-cell tint fade-in
    tintMax: 0.95, // tint opacity once solid
    sliceChase: 0.2, // slice wave lags each cell's tint start by this
    sliceFade: 0.35, // per-cell slice fade-in
    healStart: 1.9, // Act 4 start = tintSweep + sliceChase + sliceFade
    healFade: 0.4, // full-image heal fade-in
    endSeconds: 2.3, // healStart + healFade — reveal fully done
  },
} as const;

// Painting viewer (fullscreen image viewer) tuning knobs.
export const paintingViewer = {
  aspectRatios: ['1:1', '2:3', '3:2', '9:16', '16:9'], // resize menu options; each regenerates with the current image as input
} as const;

// Tuning knobs for the animated profile hero on the Settings tab (avatar +
// name). Single source of truth — adjust the animation feel here rather than
// scattering magic numbers across SettingsScreen's profileHero module.
//
// Pull-to-expand / lock is iOS-only via rubber-band overscroll; a tap on the
// avatar toggles the same lock on both platforms (Android has no overscroll,
// so those pull interpolations stay frozen and only tap drives the expand).
//
// Resting and expanded heights are DECOUPLED: at rest the hero is a compact box
// (`restingHeight`) with a small centered avatar; on lock the container grows to
// a ~half-screen full-width photo (`expandedHeightRatio·screen`), pushing the
// settings list below it down — Telegram-style — instead of overflowing over it.
export const profileHero = {
  avatarSize: 96, // resting avatar diameter (small centered circle)
  avatarRestTop: 80, // resting avatar top inside the box (clears the status bar / dynamic island)
  restingHeight: 238, // compact resting hero box height
  expandedHeightRatio: 0.46, // locked photo height as a fraction of the screen height (~half screen)
  barHeight: isIOS ? 44 : 56, // sticky bar content height, matched to the native native-stack header (iOS 44pt / Android 56dp) so it lines up with every other screen's real header; excludes the safe-area top inset
  collapseDistance: 200, // scroll distance over which the hero hands off to the sticky bar
  scrollFadeDistance: 180, // scroll distance over which the resting hero fades out (before the sticky bar fully takes over)
  nameRestPaddingBottom: 12, // name's inset from the box bottom; the name is bottom-pinned, so this places it just under the resting avatar and near the photo's bottom edge when expanded
  nameBaseFontSize: 30,
  nameLineHeight: 38,
  crossFadeStartRatio: 0.75, // small title starts fading in at 0.75·R
  lockTriggerPx: 100, // overscroll distance that snaps the avatar into the locked hero
  unlockScrollPx: 150, // scroll-up distance (from locked) that releases the lock
  lockTimingMs: 220, // lock / unlock spring-to-rest duration
  expandedRadius: 20, // locked full-width photo bottom-corner radius
  expandedScrimOpacity: 0.18, // dim over the locked photo, so the white name stays legible
  nameOverlayInsetX: 20, // locked name left inset from the photo edge
} as const;
