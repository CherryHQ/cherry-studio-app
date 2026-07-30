import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { useWindowDimensions } from 'react-native';

/**
 * Hardware corner radius of the current display, in points / dp. Returns `0`
 * when the native module cannot identify the display radius.
 */
export function useScreenCornerRadius(): number {
  // Foldables can switch displays without remounting the sheet.
  useWindowDimensions();

  return getCornerRadiusSync() ?? 0;
}
