import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Semantic haptic intents shared by CherryUI controls and product workflows.
 * Callers describe the interaction meaning rather than picking platform styles.
 */
export type HapticIntent = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error';

function invokeHaptic(intent: HapticIntent): Promise<void> | undefined {
  switch (intent) {
    case 'selection':
      return Haptics.selectionAsync();
    case 'light':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'medium':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

/**
 * Triggers a semantic haptic on native mobile platforms at the causal frame of
 * an interaction. Silently ignores unsupported environments and hardware errors
 * because visual and accessible cues always stand alone.
 */
export function triggerHaptic(intent: HapticIntent): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }

  try {
    void invokeHaptic(intent)?.catch(() => undefined);
  } catch {
    // Unsupported devices or test stubs must never break UI interaction.
  }
}

export const haptics = {
  selection: () => triggerHaptic('selection'),
  light: () => triggerHaptic('light'),
  medium: () => triggerHaptic('medium'),
  success: () => triggerHaptic('success'),
  warning: () => triggerHaptic('warning'),
  error: () => triggerHaptic('error'),
  trigger: triggerHaptic,
} as const;
