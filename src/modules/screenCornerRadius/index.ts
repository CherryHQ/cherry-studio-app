import { getCornerRadiusSync } from 'expo-screen-corner-radius';
import { useWindowDimensions } from 'react-native';

/**
 * Hardware corner radius of the display, in points / dp — `0` when unknown.
 *
 * Use it to keep a rounded rect concentric with the screen: an element inset by
 * `n` from every screen edge shares the display's corner center at radius
 * `screenCornerRadius - n`. Always handle the `0` case with a fallback.
 *
 * Backed by `expo-screen-corner-radius`, which looks the radius up by device
 * model on iOS (so a phone newer than the library's table reports `null`, not a
 * wrong number) and reads the public `WindowInsets.getRoundedCorner` API on
 * Android 12+. Every "don't know" — an unlisted model, Android < 31, web —
 * arrives here as `null` and is normalized to `0`.
 */
export function getScreenCornerRadius(): number {
  return getCornerRadiusSync() ?? 0;
}

/**
 * Hook form of {@link getScreenCornerRadius}.
 *
 * The radius is a hardware constant, but a foldable that unfolds swaps to a
 * different display — subscribing to the window metrics re-renders the caller
 * so the value is re-read on that switch.
 */
export function useScreenCornerRadius(): number {
  useWindowDimensions();

  return getScreenCornerRadius();
}
