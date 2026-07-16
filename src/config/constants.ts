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

// CherryIN OAuth configuration
export const CHERRYIN_CONFIG = {
  CLIENT_ID: '2a348c87-bae1-4756-a62f-b2e97200fd6d',
  ALLOWED_HOSTS: ['https://open.cherryin.ai', 'https://open.cherryin.dev'],
  REDIRECT_URI: 'cherrystudio://oauth/callback',
  SCOPES: 'openid profile email offline_access balance:read usage:read tokens:read tokens:write',
};
