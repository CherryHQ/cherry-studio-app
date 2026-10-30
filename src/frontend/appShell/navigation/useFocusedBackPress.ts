import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

/**
 * Gives Android back to a layer inside a route only while that route is focused. A route pushed
 * over it keeps the layer mounted underneath, and Android calls the latest listener first, so an
 * unfocused listener would take back from the visible route.
 */
export function useFocusedBackPress(onBack: () => void, enabled = true) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => subscription.remove();
    }, [enabled, onBack]),
  );
}
