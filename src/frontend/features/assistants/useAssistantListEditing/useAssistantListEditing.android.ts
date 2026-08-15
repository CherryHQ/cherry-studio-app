import { useCallback, useEffect } from 'react';

import { useSetBottomTabBarHidden } from '@/frontend/components/navigation';

export function useAssistantListEditing() {
  const setBottomTabBarHidden = useSetBottomTabBarHidden();

  useEffect(() => () => setBottomTabBarHidden(false), [setBottomTabBarHidden]);

  return useCallback(
    (isEditing: boolean) => setBottomTabBarHidden(isEditing),
    [setBottomTabBarHidden],
  );
}
