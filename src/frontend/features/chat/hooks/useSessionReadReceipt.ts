import { useFocusEffect } from 'expo-router';
import { useDrawerStatus } from 'expo-router/drawer';
import { useCallback } from 'react';
import { AppState } from 'react-native';

import { useAgentSessionStatus } from '@/frontend/hooks/agent';

/** Only the visible chat acknowledges completion; drawers and background routes do not. */
export function useSessionReadReceipt(sessionId: string) {
  const { markSeen } = useAgentSessionStatus(sessionId);
  const drawerStatus = useDrawerStatus();

  useFocusEffect(
    useCallback(() => {
      if (drawerStatus !== 'closed') {
        return;
      }
      if (AppState.currentState === 'active') {
        markSeen();
      }
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          markSeen();
        }
      });
      return () => subscription.remove();
    }, [drawerStatus, markSeen]),
  );
}
