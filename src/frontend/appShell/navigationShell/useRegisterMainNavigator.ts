import {
  type NavigationAction,
  type NavigationState,
  StackActions,
} from 'expo-router/react-navigation';
import { useEffect } from 'react';

import type { NavDestinationId } from './dockTabs';
import { type MainNavigatorHandler, useOptionalNavigationShell } from './state';

export type MainStackNavigationLike = {
  dispatch: (action: NavigationAction) => void;
  getState: () => Readonly<NavigationState> | undefined;
};

const STACK_ROUTE_BY_DEST: Record<NavDestinationId, string> = {
  chat: '(chat)',
  agents: 'agents',
  drawings: 'drawings',
  plugins: 'plugins',
  marketplace: 'skills',
  files: 'library',
  devices: 'devices',
  more: 'more',
  settings: 'settings',
};

function resolveMainStackState(
  navigation: MainStackNavigationLike,
): Readonly<NavigationState> | undefined {
  const rootState = navigation.getState();
  if (!rootState?.routes?.length) return undefined;
  // Inside `(drawer)/(main)/_layout`, `useNavigation()` resolves to the parent Drawer navigator.
  // Target `(main)`'s nested Stack state so root switches dispatch against the content stack.
  const mainRoute = rootState.routes.find((route) => route.name === '(main)');
  if (mainRoute) {
    return mainRoute.state as Readonly<NavigationState> | undefined;
  }
  return rootState;
}

/** Connects `(main)` Stack's navigation instance so root dock/rail switches keep history clean. */
export function useRegisterMainNavigator(navigation: MainStackNavigationLike): void {
  const shell = useOptionalNavigationShell();
  const register = shell?.registerMainNavigator;

  useEffect(() => {
    if (!register) return;
    const handler: MainNavigatorHandler = (id) => {
      const state = resolveMainStackState(navigation);
      if (!state?.routes?.length) return false;
      const targetRoute = STACK_ROUTE_BY_DEST[id];
      const activeRoute = state.routes[state.index];
      const currentRoute = activeRoute?.name;

      if (id === 'chat') {
        if (state.index > 0) {
          navigation.dispatch({ ...StackActions.popToTop(), target: state.key });
        }
        return 'handled';
      }

      if (currentRoute === targetRoute) {
        const nestedState = activeRoute?.state as Readonly<NavigationState> | undefined;
        if (nestedState?.key && nestedState.index > 0) {
          navigation.dispatch({ ...StackActions.popToTop(), target: nestedState.key });
        }
        return 'handled';
      }

      if (state.index === 0) {
        return 'push';
      }

      const existingIndex = state.routes.findIndex((route) => route.name === targetRoute);
      if (existingIndex > 0 && existingIndex < state.index) {
        return { action: 'dismiss', count: state.index - existingIndex };
      }

      if (state.index === 1) {
        return 'replace';
      }

      navigation.dispatch({
        ...StackActions.pop(state.index - 1),
        target: state.key,
      });
      return 'replace';
    };

    register(handler);
    return () => register(null);
  }, [navigation, register]);
}
