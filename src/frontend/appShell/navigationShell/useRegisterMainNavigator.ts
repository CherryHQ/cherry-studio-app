import {
  type NavigationAction,
  type NavigationState,
  StackActions,
} from 'expo-router/react-navigation';
import { useEffect } from 'react';

import { getNavStackRoute, type NavDestinationId } from './navRouteManifest';
import { type MainNavigatorHandler, useOptionalNavigationShellActions } from './state';

export type MainStackNavigationLike = {
  dispatch: (action: NavigationAction) => void;
  getParent?: () => MainStackNavigationLike | undefined;
  getState: () => Readonly<NavigationState> | undefined;
};

export type MainStackNavigationPlan =
  | { type: 'fallback' }
  | { type: 'noop' }
  | { target: string; type: 'popToTop' }
  | { type: 'push' }
  | { popCount?: number; target?: string; type: 'replace' }
  | { count: number; type: 'dismiss' };

function resolveMainStackState(
  navigation: MainStackNavigationLike,
): Readonly<NavigationState> | undefined {
  const rootState = navigation.getState();
  if (!rootState?.routes?.length) return undefined;
  // Inside `(drawer)/(content)/(main)/_layout`, `useNavigation()` resolves to the parent Drawer navigator.
  // Target `(main)`'s nested Stack state so root switches dispatch against the content stack.
  const mainRoute = rootState.routes.find((route) => route.name === '(main)');
  if (mainRoute) {
    return mainRoute.state as Readonly<NavigationState> | undefined;
  }
  return rootState;
}

/** Pure transition planner for top-level switches inside `(drawer)/(content)/(main)` Stack. */
export function planMainStackNavigation(
  stackState: Readonly<NavigationState> | undefined,
  id: NavDestinationId,
): MainStackNavigationPlan {
  if (!stackState?.routes?.length) {
    return { type: 'fallback' };
  }

  const targetRoute = getNavStackRoute(id);
  const activeRoute = stackState.routes[stackState.index];
  const currentRoute = activeRoute?.name;

  if (id === 'chat') {
    if (stackState.index > 0) {
      return { target: stackState.key, type: 'popToTop' };
    }
    return { type: 'noop' };
  }

  if (currentRoute === targetRoute) {
    const nestedState = activeRoute?.state as Readonly<NavigationState> | undefined;
    if (nestedState?.key && nestedState.index > 0) {
      return { target: nestedState.key, type: 'popToTop' };
    }
    return { type: 'noop' };
  }

  if (stackState.index === 0) {
    return { type: 'push' };
  }

  const existingIndex = stackState.routes.findIndex((route) => route.name === targetRoute);
  if (existingIndex > 0 && existingIndex < stackState.index) {
    return { count: stackState.index - existingIndex, type: 'dismiss' };
  }

  if (stackState.index === 1) {
    return { type: 'replace' };
  }

  return {
    popCount: stackState.index - 1,
    target: stackState.key,
    type: 'replace',
  };
}

/**
 * Applies a rail switch under the Settings card before revealing the content. The focused
 * Settings route would otherwise make Expo Router target the outer stack for push/replace.
 */
function applyCoveredContentPlan(
  navigation: MainStackNavigationLike,
  state: Readonly<NavigationState>,
  plan: Exclude<MainStackNavigationPlan, { type: 'fallback' | 'push' }>,
  route: string,
) {
  switch (plan.type) {
    case 'noop':
      break;
    case 'popToTop':
      navigation.dispatch({ ...StackActions.popToTop(), target: plan.target });
      break;
    case 'dismiss':
      navigation.dispatch({ ...StackActions.pop(plan.count), target: state.key });
      break;
    case 'replace':
      if (plan.popCount) {
        navigation.dispatch({ ...StackActions.pop(plan.popCount), target: state.key });
      }
      navigation.dispatch({ ...StackActions.replace(route), target: state.key });
      break;
  }
}

/** Connects `(main)` Stack's navigation instance so root dock/rail switches keep history clean. */
export function useRegisterMainNavigator(navigation: MainStackNavigationLike): void {
  const register = useOptionalNavigationShellActions()?.registerMainNavigator;

  useEffect(() => {
    if (!register) return;
    const handler: MainNavigatorHandler = (id, router, href) => {
      const parent = navigation.getParent?.();
      const shellState = parent?.getState();
      const activeShellRoute = shellState?.routes[shellState.index];
      const settingsIsOpen = activeShellRoute?.name === 'settings';

      if (id === 'settings') {
        if (!settingsIsOpen) router.push(href);
        else if (activeShellRoute.state?.key && (activeShellRoute.state.index ?? 0) > 0)
          parent?.dispatch({ ...StackActions.popToTop(), target: activeShellRoute.state.key });
        return true;
      }

      const state = resolveMainStackState(navigation);
      const plan = planMainStackNavigation(state, id);
      if (settingsIsOpen && shellState && parent) {
        if (state && plan.type !== 'fallback' && plan.type !== 'push') {
          applyCoveredContentPlan(navigation, state, plan, getNavStackRoute(id));
          parent.dispatch({ ...StackActions.popToTop(), target: shellState.key });
        } else {
          router.dismissTo(href);
        }
        return true;
      }

      switch (plan.type) {
        case 'fallback':
          return false;
        case 'noop':
          return true;
        case 'popToTop':
          navigation.dispatch({ ...StackActions.popToTop(), target: plan.target });
          return true;
        case 'push':
          router.push(href);
          return true;
        case 'dismiss':
          router.dismiss(plan.count);
          return true;
        case 'replace':
          if (plan.popCount && plan.target) {
            navigation.dispatch({ ...StackActions.pop(plan.popCount), target: plan.target });
          }
          router.replace(href);
          return true;
      }
    };

    register(handler);
    return () => register(null);
  }, [navigation, register]);
}
