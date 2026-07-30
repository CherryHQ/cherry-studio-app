# Use Platform-Native Navigation Gestures

Cherry Mobile will rely on platform-native navigation behavior for Android edge back gestures, predictive back preview, and native stack transitions instead of simulating edge-swipe back in JavaScript. Expo Router and React Navigation native-stack should bridge these behaviors through `react-native-screens`, while Cherry-owned components handle safe-area/inset layout and only use local `BackHandler` interception for explicit product states such as unsaved edits or active generation confirmation.

**Considered Options**

- Build a custom JavaScript edge-swipe back gesture for Android.
- Disable system back preview permanently and handle all back behavior in app code.
- Use platform-native back gestures and native stack behavior.

**Consequences**

Android edge gesture zones are reserved for the system. Horizontal gestures such as drawers, swipe actions, and carousels must avoid fighting the system edge (the navigation drawer has since been replaced by bottom tabs; the rule still applies to any horizontal gesture surface). `predictiveBackGestureEnabled` can stay disabled as a conservative default until navigation flows are stable, then be enabled and validated on real Android devices.
