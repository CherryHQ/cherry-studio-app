import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** One native subscription per chat, shared by its message rows. */
export function useIsScreenReaderEnabled() {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    let hasReceivedChange = false;
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      hasReceivedChange = true;
      setIsEnabled(enabled);
    });
    void AccessibilityInfo.isScreenReaderEnabled().then(
      (enabled) => {
        if (isCurrent && !hasReceivedChange) setIsEnabled(enabled);
      },
      () => {
        // Keep the explicit actions available if the native status cannot be read.
        if (isCurrent && !hasReceivedChange) setIsEnabled(true);
      },
    );

    return () => {
      isCurrent = false;
      subscription.remove();
    };
  }, []);

  return isEnabled;
}
