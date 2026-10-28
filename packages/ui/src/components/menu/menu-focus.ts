import { AccessibilityInfo, Platform, type ViewInstance } from 'react-native';

export function focusMenuTarget(target: ViewInstance | null) {
  if (target) {
    if (Platform.OS === 'web') {
      target.focus();
    } else {
      AccessibilityInfo.sendAccessibilityEvent(target, 'focus');
    }
  }
}
