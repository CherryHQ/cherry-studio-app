import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { usePaneChrome } from '@/frontend/appShell/layout';
import { chatHref, chatRouteParams, type ChatTarget } from '@/frontend/appShell/navigation/chat';

/**
 * Delivers a chat target from the viewer. Beside the chat the target updates it in place; a viewer
 * page first returns to that chat.
 */
export function useReturnToChat() {
  const router = useRouter();
  const isInPane = usePaneChrome() !== null;

  return useCallback(
    (target: ChatTarget) => {
      if (isInPane) router.setParams(chatRouteParams(target));
      else router.dismissTo(chatHref(target));
    },
    [isInPane, router],
  );
}
