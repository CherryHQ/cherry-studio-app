import type { NavigationState } from 'expo-router/react-navigation';

import { selectIsNestedTabScreen } from '../tabBarVisibility';

// Minimal navigation-tree factory: root stack → focused tab group → focused tab
// stack. `tabDepth` is the focused tab's stack index (0 = tab root).
function makeState({
  rootRouteName = '(tabs)',
  tabInitialized = true,
  tabDepth = 0,
}: {
  rootRouteName?: string;
  tabInitialized?: boolean;
  tabDepth?: number | null;
} = {}): NavigationState {
  return {
    index: 0,
    routes: [
      {
        key: 'root',
        name: rootRouteName,
        state: tabInitialized
          ? {
              index: 1,
              routes: [
                { key: 'home', name: 'home' },
                {
                  key: 'settings',
                  name: 'settings',
                  state: tabDepth == null ? undefined : { index: tabDepth, routes: [] },
                },
              ],
            }
          : undefined,
      },
    ],
  } as unknown as NavigationState;
}

describe('selectIsNestedTabScreen', () => {
  it('keeps the tab bar on a tab root (stack depth 0)', () => {
    expect(selectIsNestedTabScreen(makeState({ tabDepth: 0 }))).toBe(false);
  });

  it('hides the tab bar once the focused tab pushes a secondary screen', () => {
    expect(selectIsNestedTabScreen(makeState({ tabDepth: 1 }))).toBe(true);
    expect(selectIsNestedTabScreen(makeState({ tabDepth: 3 }))).toBe(true);
  });

  it('keeps the tab bar when the active root route is not the tabs group', () => {
    // A pushed root screen (topics/paintings) already covers the tabs.
    expect(selectIsNestedTabScreen(makeState({ rootRouteName: 'topics', tabDepth: 2 }))).toBe(
      false,
    );
  });

  it('treats an uninitialized tab tree as a root (no crash)', () => {
    expect(selectIsNestedTabScreen(makeState({ tabInitialized: false }))).toBe(false);
    expect(selectIsNestedTabScreen(makeState({ tabDepth: null }))).toBe(false);
  });
});
