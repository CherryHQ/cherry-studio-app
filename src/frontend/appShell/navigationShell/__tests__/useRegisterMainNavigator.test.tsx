import type { Href } from 'expo-router';
import { StackActions } from 'expo-router/react-navigation';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  type MainNavigatorHandler,
  NavigationShellActionsContext,
  type NavigationShellActions,
} from '../state';
import {
  type MainStackNavigationLike,
  planMainStackNavigation,
  useRegisterMainNavigator,
} from '../useRegisterMainNavigator';

const mockDispatch = jest.fn();
const mockRouter = {
  dismiss: jest.fn(),
  dismissTo: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
};
let mockState: ReturnType<MainStackNavigationLike['getState']>;
let mockShellState: ReturnType<MainStackNavigationLike['getState']>;
const mockParentDispatch = jest.fn();
let registeredHandler: MainNavigatorHandler | null = null;

function Harness({ navigation }: { navigation: MainStackNavigationLike }) {
  useRegisterMainNavigator(navigation);
  return null;
}

describe('useRegisterMainNavigator', () => {
  let renderer: ReactTestRenderer;
  const actionsValue = {
    registerMainNavigator: (handler: MainNavigatorHandler | null) => {
      registeredHandler = handler;
    },
  } as unknown as NavigationShellActions;

  const navigation: MainStackNavigationLike = {
    dispatch: mockDispatch,
    getParent: () => ({ dispatch: mockParentDispatch, getState: () => mockShellState }),
    getState: () => mockState,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    registeredHandler = null;
    mockShellState = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  it('plans transitions cleanly as a pure function', () => {
    expect(planMainStackNavigation(undefined, 'files')).toEqual({ type: 'fallback' });

    const rootOnlyState = {
      index: 0,
      key: 'stack-main',
      routeNames: ['(chat)', 'library'],
      routes: [{ key: 'chat-key', name: '(chat)' }],
      stale: false,
      type: 'stack',
    } as NonNullable<ReturnType<MainStackNavigationLike['getState']>>;

    expect(planMainStackNavigation(rootOnlyState, 'chat')).toEqual({ type: 'noop' });
    expect(planMainStackNavigation(rootOnlyState, 'files')).toEqual({ type: 'push' });
  });

  it('targets the nested (main) stack state and pushes when opening a tab from chat root', () => {
    mockState = {
      index: 0,
      key: 'drawer-1',
      routeNames: ['(main)'],
      routes: [
        {
          key: 'main-route',
          name: '(main)',
          state: {
            index: 0,
            key: 'stack-main',
            routeNames: ['(chat)', 'library'],
            routes: [{ key: 'chat-key', name: '(chat)' }],
            stale: false,
            type: 'stack',
          },
        },
      ],
      stale: false,
      type: 'drawer',
    } as ReturnType<MainStackNavigationLike['getState']>;

    act(() => {
      renderer = create(
        <NavigationShellActionsContext value={actionsValue}>
          <Harness navigation={navigation} />
        </NavigationShellActionsContext>,
      );
    });

    expect(registeredHandler).not.toBeNull();
    expect(registeredHandler?.('files', mockRouter, '/library' as Href)).toBe(true);
    expect(mockRouter.push).toHaveBeenCalledWith('/library');
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('returns false so provider falls back when (main) nested stack state is not yet mounted', () => {
    mockState = {
      index: 0,
      key: 'drawer-1',
      routeNames: ['(main)'],
      routes: [{ key: 'main-route', name: '(main)' }],
      stale: false,
      type: 'drawer',
    } as ReturnType<MainStackNavigationLike['getState']>;

    act(() => {
      renderer = create(
        <NavigationShellActionsContext value={actionsValue}>
          <Harness navigation={navigation} />
        </NavigationShellActionsContext>,
      );
    });

    expect(registeredHandler?.('files', mockRouter, '/library' as Href)).toBe(false);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('replaces top route at depth 1 and pops child stack when re-tapping active tab', () => {
    mockState = {
      index: 0,
      key: 'drawer-1',
      routeNames: ['(main)'],
      routes: [
        {
          key: 'main-route',
          name: '(main)',
          state: {
            index: 1,
            key: 'stack-main',
            routeNames: ['(chat)', 'agents', 'skills'],
            routes: [
              { key: 'chat-key', name: '(chat)' },
              {
                key: 'agents-key',
                name: 'agents',
                state: {
                  index: 1,
                  key: 'stack-agents',
                  routeNames: ['index', '[agentId]/edit'],
                  routes: [
                    { key: 'agents-idx', name: 'index' },
                    { key: 'agents-edit', name: '[agentId]/edit' },
                  ],
                  stale: false,
                  type: 'stack',
                },
              },
            ],
            stale: false,
            type: 'stack',
          },
        },
      ],
      stale: false,
      type: 'drawer',
    } as ReturnType<MainStackNavigationLike['getState']>;

    act(() => {
      renderer = create(
        <NavigationShellActionsContext value={actionsValue}>
          <Harness navigation={navigation} />
        </NavigationShellActionsContext>,
      );
    });

    expect(registeredHandler?.('agents', mockRouter, '/agents' as Href)).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith({
      ...StackActions.popToTop(),
      target: 'stack-agents',
    });

    mockDispatch.mockClear();
    expect(registeredHandler?.('marketplace', mockRouter, '/skills' as Href)).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith('/skills');
    expect(mockDispatch).not.toHaveBeenCalled();

    mockDispatch.mockClear();
    expect(registeredHandler?.('chat', mockRouter, '/' as Href)).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith({
      ...StackActions.popToTop(),
      target: 'stack-main',
    });
  });

  it('switches from Settings by preparing the covered main stack before revealing it', () => {
    const chat = { key: 'chat', name: '(chat)' };
    mockState = {
      index: 1,
      key: 'stack-main',
      routes: [chat, { key: 'drawings', name: 'drawings' }],
    } as NonNullable<typeof mockState>;
    mockShellState = {
      index: 1,
      key: 'stack-shell',
      routes: [
        { key: 'content', name: '(content)' },
        {
          key: 'settings',
          name: 'settings',
          state: { key: 'stack-settings', index: 1, routes: [] },
        },
      ],
    } as NonNullable<typeof mockShellState>;

    act(() => {
      renderer = create(
        <NavigationShellActionsContext value={actionsValue}>
          <Harness navigation={navigation} />
        </NavigationShellActionsContext>,
      );
    });

    expect(registeredHandler?.('settings', mockRouter, '/settings')).toBe(true);
    expect(mockParentDispatch).toHaveBeenCalledWith({
      ...StackActions.popToTop(),
      target: 'stack-settings',
    });
    expect(mockRouter.push).not.toHaveBeenCalled();

    expect(registeredHandler?.('agents', mockRouter, '/agents')).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith({
      ...StackActions.replace('agents'),
      target: 'stack-main',
    });
    expect(mockParentDispatch).toHaveBeenLastCalledWith({
      ...StackActions.popToTop(),
      target: 'stack-shell',
    });
    expect(mockDispatch.mock.invocationCallOrder[0]).toBeLessThan(
      mockParentDispatch.mock.invocationCallOrder[1],
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();

    expect(registeredHandler?.('chat', mockRouter, '/')).toBe(true);
    expect(mockDispatch).toHaveBeenLastCalledWith({
      ...StackActions.popToTop(),
      target: 'stack-main',
    });
    expect(mockParentDispatch).toHaveBeenLastCalledWith({
      ...StackActions.popToTop(),
      target: 'stack-shell',
    });

    mockState = { ...mockState, index: 0, routes: [chat] };
    expect(registeredHandler?.('files', mockRouter, '/library')).toBe(true);
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/library');

    mockShellState = { ...mockShellState, index: 0 };
    expect(registeredHandler?.('settings', mockRouter, '/settings')).toBe(true);
    expect(mockRouter.push).toHaveBeenCalledWith('/settings');
  });

  it('pops extra child depth before replacing and dismisses to existing ancestors from depth 2', () => {
    mockState = {
      index: 2,
      key: 'stack-main',
      routeNames: ['(chat)', 'more', 'library'],
      routes: [
        { key: 'chat-key', name: '(chat)' },
        { key: 'more-key', name: 'more' },
        { key: 'lib-key', name: 'library' },
      ],
      stale: false,
      type: 'stack',
    } as ReturnType<MainStackNavigationLike['getState']>;

    act(() => {
      renderer = create(
        <NavigationShellActionsContext value={actionsValue}>
          <Harness navigation={navigation} />
        </NavigationShellActionsContext>,
      );
    });

    expect(registeredHandler?.('plugins', mockRouter, '/plugins' as Href)).toBe(true);
    expect(mockDispatch).toHaveBeenCalledWith({
      ...StackActions.pop(1),
      target: 'stack-main',
    });
    expect(mockRouter.replace).toHaveBeenCalledWith('/plugins');

    mockDispatch.mockClear();
    mockRouter.replace.mockClear();
    expect(registeredHandler?.('more', mockRouter, '/more' as Href)).toBe(true);
    expect(mockRouter.dismiss).toHaveBeenCalledWith(1);
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});
