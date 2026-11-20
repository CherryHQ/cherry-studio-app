import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Semantic haptic intents shared by CherryUI controls and product workflows.
 * Callers describe the interaction meaning rather than picking platform styles.
 */
export type PressHapticIntent = 'selection' | 'light' | 'medium';
export type HapticIntent = PressHapticIntent | 'success' | 'warning' | 'error';

function androidEffect(intent: HapticIntent, apiLevel: number) {
  const effects = Haptics.AndroidHaptics;
  switch (intent) {
    case 'selection':
      return apiLevel >= 34 ? effects.Segment_Tick : effects.Clock_Tick;
    case 'light':
      return effects.Virtual_Key;
    case 'medium':
      return effects.Context_Click;
    case 'success':
      return apiLevel >= 30 ? effects.Confirm : undefined;
    case 'warning':
    case 'error':
      return apiLevel >= 30 ? effects.Reject : undefined;
  }
}

function invokeHaptic(intent: HapticIntent): Promise<void> | undefined {
  if (Platform.OS === 'android') {
    const effect = androidEffect(intent, Platform.Version);
    return effect === undefined ? undefined : Haptics.performAndroidHapticsAsync(effect);
  }
  if (Platform.OS !== 'ios') return;
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
