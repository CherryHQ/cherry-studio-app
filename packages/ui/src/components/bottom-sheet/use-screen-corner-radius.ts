import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { useWindowDimensions } from 'react-native';

export function useScreenCornerRadius(): number {
  // Foldables can switch displays without remounting the sheet.
  useWindowDimensions();

  return getCornerRadiusSync() ?? 0;
}
