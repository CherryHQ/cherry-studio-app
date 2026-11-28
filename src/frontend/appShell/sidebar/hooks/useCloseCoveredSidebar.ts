import { useNavigation } from 'expo-router';
import { DrawerActions } from 'expo-router/react-navigation';
import { useCallback } from 'react';

/** Closes the drawer below a shell card when the action explicitly opens another destination. */
export function useCloseCoveredSidebar() {
  const shell = useNavigation('/(drawer)');
  return useCallback(() => {
    const content = shell.getState()?.routes.find((route) => route.name === '(content)');
    const drawerKey = content?.state?.key;
    if (drawerKey) shell.dispatch({ ...DrawerActions.closeDrawer(), target: drawerKey });
  }, [shell]);
}
