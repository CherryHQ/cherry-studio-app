import { MobileDefaultPreferences } from './mobilePreferenceSchemas';
import { DefaultPreferences } from './preferenceSchemas';

/** Desktop-aligned defaults plus preferences owned only by the mobile app. */
export const PreferenceDefaults = {
  default: {
    ...DefaultPreferences.default,
    ...MobileDefaultPreferences,
  },
};
