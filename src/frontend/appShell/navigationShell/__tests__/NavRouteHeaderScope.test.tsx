import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { RouteHeaderRootAction } from '@/frontend/appShell/header';

import { NavRouteHeaderScope, resolveRouteHeaderRootAction } from '../NavRouteHeaderScope';
import { NavigationShellContext, type NavigationShellState } from '../state';

let capturedRootAction: RouteHeaderRootAction | undefined;

jest.mock('@/frontend/appShell/header', () => ({
  RouteHeaderProvider: ({
    children,
    rootAction,
  }: {
    children?: React.ReactNode;
    rootAction: RouteHeaderRootAction;
  }) => {
    capturedRootAction = rootAction;
    return children ?? null;
  },
}));

describe('resolveRouteHeaderRootAction & NavRouteHeaderScope', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    capturedRootAction = undefined;
  });

  test('resolves leading actions by destination, shellMode, and pinnedTabs', () => {
    expect(resolveRouteHeaderRootAction('more', 'compact-dock', ['agents'])).toBe('drawer');
    expect(resolveRouteHeaderRootAction('agents', 'compact-dock', ['agents'])).toBe('drawer');
    expect(resolveRouteHeaderRootAction('drawings', 'compact-dock', ['agents'])).toBe('back');
    expect(resolveRouteHeaderRootAction('drawings', 'compact-dock', ['agents', 'drawings'])).toBe(
      'drawer',
    );
    expect(resolveRouteHeaderRootAction('settings', 'compact-dock', ['agents'])).toBe('back');

    expect(resolveRouteHeaderRootAction('chat', 'wide-rail', ['agents'])).toBe('drawer');
    expect(resolveRouteHeaderRootAction('more', 'wide-rail', ['agents'])).toBe('none');
    expect(resolveRouteHeaderRootAction('agents', 'wide-rail', ['agents'])).toBe('none');
  });

  test('binds per-stack header action independently of active global pathname', () => {
    const shell = {
      activeDestination: 'settings',
      isAtRoot: false,
      pinnedTabs: ['agents', 'files'],
      shellMode: 'compact-dock',
    } as NavigationShellState;

    act(() => {
      renderer = create(
        <NavigationShellContext value={shell}>
          <NavRouteHeaderScope destination="more" />
        </NavigationShellContext>,
      );
    });
    expect(capturedRootAction).toBe('drawer');

    act(() => {
      renderer!.update(
        <NavigationShellContext value={shell}>
          <NavRouteHeaderScope destination="files" />
        </NavigationShellContext>,
      );
    });
    expect(capturedRootAction).toBe('drawer');

    act(() => {
      renderer!.update(
        <NavigationShellContext value={shell}>
          <NavRouteHeaderScope destination="drawings" />
        </NavigationShellContext>,
      );
    });
    expect(capturedRootAction).toBe('back');
  });
});
