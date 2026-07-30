import type { NavigationState } from 'expo-router/react-navigation';

// The native bottom tab bar belongs to each tab's root. As soon as a tab pushes a
// secondary screen (settings → provider, assistants → edit, …) the bar should go
// away — matching iOS's hidesBottomBarWhenPushed — so every stack behaves the
// same without each screen opting in.
//
// This runs against the ROOT stack's state (the navigator that hosts the `(tabs)`
// group), so we walk root → `(tabs)` → focused tab and report whether the focused
// tab's own stack sits past its root (index > 0). When the active root route is
// not `(tabs)` (onboarding, a pushed `topics`/`paintings` screen) the tab bar is
// already covered, so there is nothing to hide.
export function selectIsNestedTabScreen(state: NavigationState): boolean {
  const tabsRoute = state.routes[state.index];

  if (tabsRoute?.name !== '(tabs)') {
    return false;
  }

  const tabsState = tabsRoute.state;
  const focusedTab = tabsState?.index != null ? tabsState.routes[tabsState.index] : undefined;
  const stackIndex = focusedTab?.state?.index;

  return stackIndex != null && stackIndex > 0;
}
