import { AccessibilityInfo, Platform, type View } from 'react-native';

export function focusMenuTarget(target: View | null) {
  if (target) {
    if (Platform.OS === 'web') {
      target.focus();
    } else {
      AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
    }
  }
}
