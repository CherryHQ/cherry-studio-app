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
  push: jest.fn(),
  replace: jest.fn(),
};
let mockState: ReturnType<MainStackNavigationLike['getState']>;
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
    getState: () => mockState,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    registeredHandler = null;
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
