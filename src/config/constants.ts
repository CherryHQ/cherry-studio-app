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
