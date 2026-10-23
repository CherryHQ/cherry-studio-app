import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState } from 'react-native';

import { useBackgroundTaskNotifications } from '@/frontend/appShell/backgroundActivity';
import { useSidebarPresence } from '@/frontend/appShell/sidebar';
import { useAgentSessionStatus } from '@/frontend/hooks/agent';

/** Only the visible chat acknowledges completion; an overlaid drawer and background routes do not. */
export function useSessionReadReceipt(sessionId: string) {
  const { markSeen } = useAgentSessionStatus(sessionId);
  // A permanent sidebar sits beside the chat; only the overlay covers it.
  const isChatVisible = useSidebarPresence() !== 'open';
  useBackgroundTaskNotifications({ kind: 'chat', sessionId }, isChatVisible);

  useFocusEffect(
    useCallback(() => {
      if (!isChatVisible) {
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
    }, [isChatVisible, markSeen]),
  );
}
