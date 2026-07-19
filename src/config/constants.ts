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

// Tuning knobs for the animated sticky header on the Home tab (profile avatar +
// name). Single source of truth — adjust the animation feel here rather than
// scattering magic numbers across HomeScreen's hooks/components.
//
// Pull-to-expand / lock behaviour is iOS-only (Android has no rubber-band
// overscroll, so those interpolations stay frozen at rest).
export const homeHeader = {
  avatarSize: 130, // collapsed hero avatar diameter
  avatarRestMarginTop: 40, // shifts the resting avatar below the hero box's optical center
  barHeight: 44, // sticky bar content row height (excludes safe-area top inset)
  collapseDistance: 200, // scroll distance over which the hero hands off to the sticky bar
  heroContainerHeight: 400, // fixed hero box height; the expanding image overflows it, never pushes layout
  nameGap: 12, // resting gap between the avatar's bottom edge and the name
  nameBaseFontSize: 30,
  nameLineHeight: 38,
  crossFadeStartRatio: 0.75, // small title starts fading in at 0.75·R
  lockTriggerPx: 100, // overscroll distance that snaps the avatar into the locked hero
  unlockScrollPx: 150, // scroll-up distance (from locked) that releases the lock
  lockTimingMs: 500, // lock / unlock spring-to-rest duration
  expandedRadius: 40, // locked full-width hero corner radius
  expandedNameFontSize: 40, // locked name font size
  expandedNameLineHeight: 48, // locked name line height (keeps ascenders/descenders from clipping)
  nameOverlayInsetX: 20, // locked name left inset from the big hero edge
  nameLockedRise: 9, // locked name nudges up by this much (reference: translateY -10 -> -19)
} as const;
